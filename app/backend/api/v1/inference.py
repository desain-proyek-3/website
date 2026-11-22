"""
Dentify API v1 — Inference Endpoints
Trigger inferensi AI (satu citra atau batch) dan cek status job.
Role akses:
- Admin & Examiner: POST trigger / batch untuk citra subjek post-mortem
- Admin saja: POST trigger / batch untuk citra milik subjek ante-mortem
- Semua role: GET status job
Job dijalankan di background dengan batas AI_SERVICE_MAX_CONCURRENT_JOBS bersamaan;
job yang tertinggal saat backend restart ditandai failed oleh recover_interrupted_jobs().
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import async_session_factory, get_db
from dependencies.auth import AM_ADMIN_ONLY_DETAIL, ensure_can_modify_subject_type, get_current_user, require_role
from models.dental_image import DentalImage
from models.inference_job import InferenceJob
from models.subject import Subject
from models.tooth_record import ToothRecord
from models.user import User
from schemas.inference_job import (
    MAX_BATCH_SIZE,
    InferenceBatchRequest,
    InferenceBatchResponse,
    InferenceBatchSkipped,
    InferenceJobCreate,
    InferenceJobResponse,
)
from services.ai_service_client import ai_service_client
from services.inference_status import ACTIVE_JOB_STATUSES, ai_status_for_images
from services.storage_service import storage_service
from services.subject_embedding import EMBEDDING_DIM, is_valid_vector, recompute_subject_embedding

router = APIRouter(prefix="/inference", tags=["Inference"])

logger = logging.getLogger("dentify.inference")

# ── Strong reference set untuk background tasks (pola dari audit_middleware.py) ──
_background_tasks: set[asyncio.Task] = set()

# ── Batas job AI yang diproses bersamaan (trigger + polling) ──
# Job lain menunggu giliran dengan status 'pending' — batch besar tidak membanjiri LXC AI.
_ai_job_slots = asyncio.Semaphore(max(1, settings.AI_SERVICE_MAX_CONCURRENT_JOBS))


async def _poll_and_update_job(job_id: UUID, ai_job_id: str) -> None:
    """
    Background task: polling status job ke AI service, lalu update DB.
    Buka session database sendiri (BUKAN reuse session request yang sudah closed).
    """
    try:
        result = await ai_service_client.poll_until_complete(ai_job_id)

        ai_status = result.get("status", "failed").lower()
        now = datetime.now(timezone.utc)

        async with async_session_factory() as session:
            stmt = select(InferenceJob).where(InferenceJob.id == job_id)
            db_result = await session.execute(stmt)
            job = db_result.scalar_one_or_none()

            if not job:
                logger.error(
                    "[INFERENCE_BG] Job %s tidak ditemukan di DB saat menyimpan hasil AI "
                    "(ai_job_id=%s) — hasil inferensi dibuang",
                    job_id,
                    ai_job_id,
                )
                return

            if ai_status == "completed":
                # Kunci row subjek sampai commit: hasil job lain untuk subjek yang sama
                # (mis. citra depan/kiri/kanan) menunggu giliran. Tanpa ini, pola
                # cek-lalu-insert di bawah bisa bentrok di UNIQUE(embeddings.subject_id)
                # dan delete-lalu-insert tooth_records bisa menghasilkan duplikat.
                await session.execute(
                    select(Subject.id).where(Subject.id == job.subject_id).with_for_update()
                )

                job.status = "completed"
                res_payload = result.get("result") or {}
                job.result_payload = res_payload
                # Diisi SEBELUM penghitungan embedding: job ini harus terbaca sebagai
                # hasil terbaru untuk citranya (urut completed_at).
                job.updated_at = now
                job.completed_at = now

                # 1. Embedding subjek = rata-rata embedding terbaru tiap citra aktif
                #    (AI menghasilkan subject_embedding per citra, lihat services/subject_embedding.py)
                if not is_valid_vector(res_payload.get("subject_embedding")):
                    logger.warning(
                        "[INFERENCE_BG] Job %s: subject_embedding tidak ada / bukan vektor %d-dim — "
                        "citra ini tidak ikut embedding subjek",
                        job_id,
                        EMBEDDING_DIM,
                    )
                await recompute_subject_embedding(session, job.subject_id, now)

                # 2. Simpan per-tooth records jika ada
                detected_teeth = res_payload.get("detected_teeth")
                if detected_teeth and isinstance(detected_teeth, list):
                    # Bersihkan record gigi lama untuk citra ini (mencegah duplikasi saat re-run)
                    await session.execute(
                        delete(ToothRecord).where(ToothRecord.dental_image_id == job.dental_image_id)
                    )

                    for tooth in detected_teeth:
                        fdi = tooth.get("fdi_id") or tooth.get("fdi_number")
                        if fdi is not None:
                            try:
                                fdi_num = int(fdi)
                            except (ValueError, TypeError):
                                continue

                            if 11 <= fdi_num <= 48:
                                tooth_rec = ToothRecord(
                                    dental_image_id=job.dental_image_id,
                                    fdi_number=fdi_num,
                                    bbox=tooth.get("bbox"),
                                    landmarks=tooth.get("landmarks"),
                                    morphology_features=_first_present(tooth, "morphology", "morphology_features"),
                                    confidence_score=_first_present(tooth, "confidence", "confidence_score"),
                                    created_at=now,
                                )
                                session.add(tooth_rec)
            else:
                job.status = "failed"
                job.error_message = result.get("error") or "Unknown error from AI service"
                job.updated_at = now
                job.completed_at = now

            await session.commit()

    except Exception as e:
        print(f"[INFERENCE_BG] Error polling job {job_id}: {e}")
        # Coba update status jadi failed
        try:
            async with async_session_factory() as session:
                stmt = select(InferenceJob).where(InferenceJob.id == job_id)
                db_result = await session.execute(stmt)
                job = db_result.scalar_one_or_none()
                if job and job.status not in ("completed", "failed"):
                    job.status = "failed"
                    job.error_message = f"Background polling error: {e}"
                    job.updated_at = datetime.now(timezone.utc)
                    job.completed_at = datetime.now(timezone.utc)
                    await session.commit()
        except Exception as inner_e:
            print(f"[INFERENCE_BG] Gagal update status failed untuk job {job_id}: {inner_e}")


def _first_present(data: dict, *keys: str):
    """Nilai kunci pertama yang ada & bukan None (beda dengan `or`: 0 / {} tetap dipakai)."""
    for key in keys:
        if data.get(key) is not None:
            return data[key]
    return None


def _new_job(dental_image: DentalImage, user: User) -> InferenceJob:
    """Row inference_jobs baru berstatus pending (belum di-commit)."""
    now = datetime.now(timezone.utc)
    return InferenceJob(
        dental_image_id=dental_image.id,
        subject_id=dental_image.subject_id,
        status="pending",
        request_payload={
            "dental_image_id": str(dental_image.id),
            "subject_id": str(dental_image.subject_id),
            "image_path": dental_image.file_path,
            "view_type": dental_image.view_type,
        },
        retry_count=0,
        created_by=user.id,
        created_at=now,
        updated_at=now,
    )


def _schedule_job(job_id: UUID) -> None:
    """Jalankan job di background; strong reference disimpan agar tidak di-GC."""
    task = asyncio.create_task(_run_job(job_id))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _run_job(job_id: UUID) -> None:
    """
    Trigger AI service lalu polling sampai selesai. Menunggu slot `_ai_job_slots` dulu —
    selama menunggu job tetap 'pending'. Presigned URL dibuat SAAT slot didapat (bukan
    saat job dibuat) agar tidak kedaluwarsa ketika antrean batch panjang.
    """
    async with _ai_job_slots:
        try:
            ai_job_id = None
            async with async_session_factory() as session:
                job = (
                    await session.execute(select(InferenceJob).where(InferenceJob.id == job_id))
                ).scalar_one_or_none()
                if not job:
                    # Seharusnya tidak terjadi sejak job di-commit sebelum _schedule_job;
                    # kalau muncul, job akan tertahan 'pending'.
                    logger.error(
                        "[INFERENCE_BG] Job %s tidak terlihat oleh background task — "
                        "AI service tidak dipanggil, job akan tertahan 'pending'",
                        job_id,
                    )
                    return
                if job.status != "pending":
                    return  # mis. sudah ditandai failed oleh pemulihan startup

                try:
                    # Dibaca dari citra (bukan request_payload): job lama belum menyimpan view_type
                    image = (
                        await session.execute(
                            select(DentalImage.file_path, DentalImage.view_type).where(
                                DentalImage.id == job.dental_image_id
                            )
                        )
                    ).one()
                    image_url = storage_service.get_presigned_url(object_name=image.file_path, expires_seconds=3600)
                    job.request_payload = {
                        **(job.request_payload or {}),
                        "view_type": image.view_type,
                        "image_url": image_url,
                    }

                    trigger_result = await ai_service_client.trigger_inference(
                        dental_image_id=job.dental_image_id,
                        subject_id=job.subject_id,
                        image_url=image_url,
                        view_type=image.view_type,
                    )
                    ai_job_id = trigger_result.get("job_id")
                    job.ai_service_job_id = ai_job_id
                    job.status = "processing"
                    job.updated_at = datetime.now(timezone.utc)
                    await session.commit()

                except Exception as e:
                    job.status = "failed"
                    job.error_message = f"Gagal trigger AI service: {e}"
                    job.updated_at = datetime.now(timezone.utc)
                    job.completed_at = datetime.now(timezone.utc)
                    await session.commit()
                    return

            # Polling (hanya jika trigger berhasil dan dapat ai_job_id)
            if ai_job_id:
                await _poll_and_update_job(job_id, ai_job_id)
            else:
                await _mark_failed(job_id, "AI service tidak mengembalikan job_id")

        except Exception as e:
            logger.exception("[INFERENCE_BG] Unexpected error in _run_job for job %s: %s", job_id, e)
            await _mark_failed(job_id, f"Background error: {e}")


async def _mark_failed(job_id: UUID, message: str) -> None:
    try:
        async with async_session_factory() as session:
            job = (await session.execute(select(InferenceJob).where(InferenceJob.id == job_id))).scalar_one_or_none()
            if job and job.status not in ("completed", "failed"):
                now = datetime.now(timezone.utc)
                job.status = "failed"
                job.error_message = message
                job.updated_at = now
                job.completed_at = now
                await session.commit()
    except Exception as e:
        logger.error("[INFERENCE_BG] Gagal menandai job %s failed: %s", job_id, e)


async def recover_interrupted_jobs() -> int:
    """
    Dipanggil saat startup: job 'pending'/'processing' dari proses sebelumnya tidak akan
    pernah selesai (polling berjalan di dalam proses yang sudah mati) → tandai 'failed'
    agar bisa diproses ulang. Asumsi: 1 worker uvicorn (lihat deploy-webapp.md) — dengan
    beberapa worker, fungsi ini akan menggagalkan job milik worker lain.
    """
    now = datetime.now(timezone.utc)
    async with async_session_factory() as session:
        result = await session.execute(
            update(InferenceJob)
            .where(InferenceJob.status.in_(ACTIVE_JOB_STATUSES))
            .values(
                status="failed",
                error_message="Dihentikan: backend di-restart sebelum job selesai — jalankan ulang AI untuk citra ini",
                updated_at=now,
                completed_at=now,
            )
        )
        await session.commit()
        return result.rowcount


@router.post(
    "/trigger",
    response_model=InferenceJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger AI Inference",
    description=(
        "Memulai job inferensi AI untuk sebuah citra dental. "
        "Job diproses secara asynchronous — gunakan GET /jobs/{job_id} untuk cek status. "
        "Hanya untuk role admin dan examiner."
    ),
)
async def trigger_inference(
    payload: InferenceJobCreate,
    request: Request,
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InferenceJobResponse:
    """Trigger job inferensi baru ke AI microservice."""

    # 1. Validasi dental_image ada dan belum soft-deleted
    stmt = select(DentalImage).where(
        DentalImage.id == payload.dental_image_id,
        DentalImage.is_deleted == False,
    )
    result = await db.execute(stmt)
    dental_image = result.scalar_one_or_none()

    if not dental_image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Citra dental tidak ditemukan atau telah dihapus",
        )

    subject_type = await db.scalar(select(Subject.subject_type).where(Subject.id == dental_image.subject_id))
    ensure_can_modify_subject_type(current_user, subject_type)

    # 2. Buat row inference_jobs dengan status pending
    new_job = _new_job(dental_image, current_user)
    db.add(new_job)
    # Commit (bukan hanya flush) SEBELUM create_task: background task memakai
    # session/koneksi sendiri dan hanya bisa melihat row yang sudah di-commit.
    # Tanpa ini job kadang tidak ditemukan dan tertahan 'pending' selamanya.
    await db.commit()
    await db.refresh(new_job)

    # 3. Set metadata untuk audit_middleware
    request.state.audit_action = "TRIGGER_INFERENCE"
    request.state.resource_type = "inference_jobs"
    request.state.resource_id = new_job.id

    # 4. Trigger ke AI service di background (bergiliran, lihat _ai_job_slots), lalu polling
    _schedule_job(new_job.id)

    return InferenceJobResponse.model_validate(new_job)


@router.post(
    "/batch",
    response_model=InferenceBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger AI Inference for Many Images",
    description=(
        f"Memicu inferensi untuk banyak citra sekaligus (maks. {MAX_BATCH_SIZE}), mis. dataset lama "
        "yang belum diproses AI. Job dibuat berstatus 'pending' lalu dijalankan bergiliran "
        "(maks. AI_SERVICE_MAX_CONCURRENT_JOBS bersamaan). Citra yang tidak ada, tidak boleh "
        "diakses (AM untuk non-admin), sedang diproses, atau sudah pernah berhasil diproses "
        "(kecuali force=true) dilewati dan dilaporkan di `skipped`. Hanya admin dan examiner."
    ),
)
async def trigger_inference_batch(
    payload: InferenceBatchRequest,
    request: Request,
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InferenceBatchResponse:
    requested = list(dict.fromkeys(payload.dental_image_ids))  # buang duplikat, urutan dipertahankan

    rows = (
        await db.execute(
            select(DentalImage, Subject.subject_type)
            .join(Subject, Subject.id == DentalImage.subject_id)
            .where(
                DentalImage.id.in_(requested),
                DentalImage.is_deleted == False,
                Subject.is_deleted == False,
            )
        )
    ).all()
    found = {img.id: (img, subject_type) for img, subject_type in rows}
    statuses = await ai_status_for_images(db, found.keys())

    new_jobs: list[InferenceJob] = []
    skipped: list[InferenceBatchSkipped] = []
    for image_id in requested:
        if image_id not in found:
            skipped.append(InferenceBatchSkipped(
                dental_image_id=image_id, reason="not_found",
                detail="Citra tidak ditemukan atau citra/subjeknya telah dihapus",
            ))
            continue
        image, subject_type = found[image_id]
        st = statuses[image_id]
        if subject_type == "ante_mortem" and current_user.role != "admin":
            skipped.append(InferenceBatchSkipped(
                dental_image_id=image_id, reason="forbidden", detail=AM_ADMIN_ONLY_DETAIL,
            ))
        elif st.status in ACTIVE_JOB_STATUSES:
            skipped.append(InferenceBatchSkipped(
                dental_image_id=image_id, reason="already_running",
                detail=f"Citra sedang diproses (job {st.latest_job_id}, status {st.status})",
            ))
        elif st.processed and not payload.force:
            skipped.append(InferenceBatchSkipped(
                dental_image_id=image_id, reason="already_processed",
                detail="Citra sudah pernah berhasil diproses AI (gunakan force=true untuk memproses ulang)",
            ))
        else:
            job = _new_job(image, current_user)
            db.add(job)
            new_jobs.append(job)

    await db.commit()  # wajib sebelum _schedule_job (lihat trigger_inference)
    for job in new_jobs:
        await db.refresh(job)
        _schedule_job(job.id)

    request.state.audit_action = "TRIGGER_INFERENCE_BATCH"
    request.state.resource_type = "inference_jobs"
    request.state.audit_details = {
        "requested": len(requested),
        "created": len(new_jobs),
        "skipped": len(skipped),
        "force": payload.force,
    }

    return InferenceBatchResponse(
        jobs=[InferenceJobResponse.model_validate(j) for j in new_jobs],
        skipped=skipped,
        max_concurrent=settings.AI_SERVICE_MAX_CONCURRENT_JOBS,
    )


@router.get(
    "/jobs/{job_id}",
    response_model=InferenceJobResponse,
    summary="Get Inference Job Status",
    description="Mendapatkan status dan detail sebuah inference job. Dapat diakses semua role.",
)
async def get_inference_job(
    job_id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InferenceJobResponse:
    """Ambil detail inference job berdasarkan ID."""
    stmt = select(InferenceJob).where(InferenceJob.id == job_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inference job tidak ditemukan",
        )

    request.state.resource_id = job.id
    return InferenceJobResponse.model_validate(job)
