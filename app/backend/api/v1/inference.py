"""
Dentify API v1 — Inference Endpoints
Trigger inferensi AI (satu citra atau batch) dan cek status job.
Role akses:
- Admin & Examiner: POST trigger / batch untuk citra subjek post-mortem
- Admin saja: POST trigger / batch untuk citra milik subjek ante-mortem
- Semua role: GET status job, GET perbandingan analisis ulang
- Analisis ulang (Pekan 13): POST /reanalyze + POST /jobs/{id}/reanalysis/decision mengikuti aturan
  role yang sama dengan trigger (AM: admin saja). Hasilnya ditahan sebagai usulan sampai Confirm.
Job dijalankan di background dengan batas AI_SERVICE_MAX_CONCURRENT_JOBS bersamaan;
job yang tertinggal saat backend restart ditandai failed oleh recover_interrupted_jobs().
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import async_session_factory, get_db
from dependencies.auth import AM_ADMIN_ONLY_DETAIL, ensure_can_modify_subject_type, get_current_user, require_role
from models.dental_image import DentalImage
from models.inference_job import InferenceJob
from models.matching_result import MatchingResult
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
    ReanalysisComparisonResponse,
    ReanalysisDecisionRequest,
    ReanalysisDecisionResponse,
    ReanalysisSummary,
    ReanalysisTooth,
)
from services.ai_service_client import ai_service_client
from services.inference_status import (
    ACTIVE_JOB_STATUSES,
    REANALYSIS_KEY,
    ImageAiStatus,
    ai_status_for_images,
    is_reanalysis_job,
    reanalysis_review,
)
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
                res_payload = result.get("result") or {}
                if is_reanalysis_job(job):
                    # Analisis ulang: hasil disimpan sebagai USULAN — tooth_records & embedding
                    # tidak disentuh sampai pengguna memilih Confirm (decide_reanalysis).
                    job.status = "completed"
                    job.result_payload = res_payload
                    job.updated_at = now
                    job.completed_at = now
                else:
                    # Kunci row subjek sampai commit: hasil job lain untuk subjek yang sama
                    # (mis. citra depan/kiri/kanan) menunggu giliran. Tanpa ini, pola
                    # cek-lalu-insert di embedding bisa bentrok di UNIQUE(embeddings.subject_id)
                    # dan delete-lalu-insert tooth_records bisa menghasilkan duplikat.
                    await _lock_subject(session, job.subject_id)

                    job.status = "completed"
                    job.result_payload = res_payload
                    # Diisi SEBELUM penghitungan embedding: job ini harus terbaca sebagai
                    # hasil terbaru untuk citranya (urut completed_at).
                    job.updated_at = now
                    job.completed_at = now
                    await _apply_job_result(session, job, now)
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


async def _lock_subject(session: AsyncSession, subject_id: UUID) -> None:
    """SELECT ... FOR UPDATE pada row subjek (serialisasi perubahan embedding & tooth_records)."""
    await session.execute(select(Subject.id).where(Subject.id == subject_id).with_for_update())


def tooth_rows_from_result(res_payload: dict | None) -> list[dict]:
    """
    Baris tooth_records dari `result_payload` AI — dipakai saat menerapkan hasil job DAN
    untuk pratinjau analisis ulang, sehingga yang dipratinjau = yang nanti disimpan.
    Hanya FDI 11–48; duplikat FDI dipertahankan (sama seperti sebelumnya).
    """
    detected = (res_payload or {}).get("detected_teeth")
    if not isinstance(detected, list):
        return []
    rows = []
    for tooth in detected:
        if not isinstance(tooth, dict):
            continue
        fdi = tooth.get("fdi_id") or tooth.get("fdi_number")
        try:
            fdi_num = int(fdi)
        except (ValueError, TypeError):
            continue
        if 11 <= fdi_num <= 48:
            rows.append({
                "fdi_number": fdi_num,
                "bbox": tooth.get("bbox"),
                "landmarks": tooth.get("landmarks"),
                "morphology_features": _first_present(tooth, "morphology", "morphology_features"),
                "confidence_score": _first_present(tooth, "confidence", "confidence_score"),
            })
    return rows


async def _apply_job_result(session: AsyncSession, job: InferenceJob, now: datetime) -> int:
    """
    Terapkan `result_payload` job yang hasilnya berlaku: embedding subjek dihitung ulang dan
    tooth_records citra DIGANTI (juga bila hasil baru 0 gigi — hasil lama tidak tertinggal).
    Pemanggil wajib sudah mengunci row subjek (_lock_subject). Tidak commit.
    """
    res_payload = job.result_payload or {}

    # 1. Embedding subjek = rata-rata embedding terbaru tiap citra aktif
    #    (AI menghasilkan subject_embedding per citra, lihat services/subject_embedding.py)
    if not is_valid_vector(res_payload.get("subject_embedding")):
        logger.warning(
            "[INFERENCE_BG] Job %s: subject_embedding tidak ada / bukan vektor %d-dim — "
            "citra ini tidak ikut embedding subjek",
            job.id,
            EMBEDDING_DIM,
        )
    await recompute_subject_embedding(session, job.subject_id, now)

    # 2. Ganti per-tooth records citra ini
    await session.execute(delete(ToothRecord).where(ToothRecord.dental_image_id == job.dental_image_id))
    rows = tooth_rows_from_result(res_payload)
    for row in rows:
        session.add(ToothRecord(dental_image_id=job.dental_image_id, created_at=now, **row))
    return len(rows)


def _first_present(data: dict, *keys: str):
    """Nilai kunci pertama yang ada & bukan None (beda dengan `or`: 0 / {} tetap dipakai)."""
    for key in keys:
        if data.get(key) is not None:
            return data[key]
    return None


def _new_job(dental_image: DentalImage, user: User, *, reanalysis: bool = False) -> InferenceJob:
    """Row inference_jobs baru berstatus pending (belum di-commit)."""
    now = datetime.now(timezone.utc)
    request_payload = {
        "dental_image_id": str(dental_image.id),
        "subject_id": str(dental_image.subject_id),
        "image_path": dental_image.file_path,
        "view_type": dental_image.view_type,
    }
    if reanalysis:
        request_payload[REANALYSIS_KEY] = {"review": "pending"}
    return InferenceJob(
        dental_image_id=dental_image.id,
        subject_id=dental_image.subject_id,
        status="pending",
        request_payload=request_payload,
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


REANALYSIS_PENDING_DETAIL = (
    "Masih ada hasil analisis ulang yang menunggu keputusan untuk citra ini — pilih Confirm atau Reject dulu"
)


async def _get_image_for_update(db: AsyncSession, image_id: UUID) -> DentalImage:
    """Citra aktif + kunci row-nya: dua trigger bersamaan untuk citra yang sama diproses bergiliran."""
    image = (
        await db.execute(
            select(DentalImage)
            .where(DentalImage.id == image_id, DentalImage.is_deleted == False)  # noqa: E712
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Citra dental tidak ditemukan atau telah dihapus",
        )
    return image


def _ensure_can_start_job(st: ImageAiStatus) -> None:
    """409 bila citra masih punya job berjalan atau hasil analisis ulang yang belum diputuskan."""
    if st.active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Citra ini sedang diproses AI — tunggu sampai job selesai",
        )
    if st.reanalysis and st.reanalysis.status == "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=REANALYSIS_PENDING_DETAIL)


@router.post(
    "/trigger",
    response_model=InferenceJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger AI Inference",
    description=(
        "Memulai job inferensi AI untuk sebuah citra dental. "
        "Job diproses secara asynchronous — gunakan GET /jobs/{job_id} untuk cek status. "
        "409 bila citra sedang diproses atau masih ada analisis ulang yang menunggu keputusan. "
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

    # 1. Validasi dental_image ada dan belum soft-deleted (row dikunci sampai commit)
    dental_image = await _get_image_for_update(db, payload.dental_image_id)

    subject_type = await db.scalar(select(Subject.subject_type).where(Subject.id == dental_image.subject_id))
    ensure_can_modify_subject_type(current_user, subject_type)

    # 1b. Tidak boleh ada job berjalan / analisis ulang menunggu keputusan untuk citra ini
    _ensure_can_start_job((await ai_status_for_images(db, [dental_image.id]))[dental_image.id])

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
        elif st.active:
            skipped.append(InferenceBatchSkipped(
                dental_image_id=image_id, reason="already_running",
                detail="Citra sedang diproses AI (termasuk analisis ulang)",
            ))
        elif st.reanalysis and st.reanalysis.status == "completed":
            skipped.append(InferenceBatchSkipped(
                dental_image_id=image_id, reason="reanalysis_pending", detail=REANALYSIS_PENDING_DETAIL,
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


@router.post(
    "/reanalyze",
    response_model=InferenceJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Re-analyze an Already Processed Image",
    description=(
        "Menjalankan ulang AI untuk citra yang SUDAH pernah berhasil diproses. Hasilnya disimpan sebagai "
        "usulan (hasil saat ini tidak berubah) — tinjau lewat GET /jobs/{job_id}/reanalysis lalu putuskan "
        "lewat POST /jobs/{job_id}/reanalysis/decision. 409 bila citra belum pernah diproses, sedang "
        "diproses, atau masih punya hasil analisis ulang yang menunggu keputusan. Admin & examiner "
        "(citra AM: admin saja)."
    ),
)
async def trigger_reanalysis(
    payload: InferenceJobCreate,
    request: Request,
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InferenceJobResponse:
    dental_image = await _get_image_for_update(db, payload.dental_image_id)

    subject_type = await db.scalar(select(Subject.subject_type).where(Subject.id == dental_image.subject_id))
    ensure_can_modify_subject_type(current_user, subject_type)

    st = (await ai_status_for_images(db, [dental_image.id]))[dental_image.id]
    if not st.processed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Citra belum pernah berhasil diproses AI — gunakan 'Jalankan AI', bukan analisis ulang",
        )
    _ensure_can_start_job(st)

    new_job = _new_job(dental_image, current_user, reanalysis=True)
    db.add(new_job)
    await db.commit()  # wajib sebelum _schedule_job (lihat trigger_inference)
    await db.refresh(new_job)

    request.state.audit_action = "TRIGGER_REANALYSIS"
    request.state.resource_type = "inference_jobs"
    request.state.resource_id = new_job.id
    request.state.audit_details = {"dental_image_id": str(dental_image.id)}

    _schedule_job(new_job.id)
    return InferenceJobResponse.model_validate(new_job)


async def _get_reanalysis_job(db: AsyncSession, job_id: UUID) -> InferenceJob:
    job = await db.get(InferenceJob, job_id)
    if not job or not is_reanalysis_job(job):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job analisis ulang tidak ditemukan")
    return job


async def _current_tooth_rows(db: AsyncSession, image_id: UUID) -> list[ToothRecord]:
    return list(
        (
            await db.execute(
                select(ToothRecord)
                .where(ToothRecord.dental_image_id == image_id)
                .order_by(ToothRecord.fdi_number, ToothRecord.created_at)
            )
        ).scalars().all()
    )


@router.get(
    "/jobs/{job_id}/reanalysis",
    response_model=ReanalysisComparisonResponse,
    summary="Compare Current vs Re-analysis Result",
    description=(
        "Perbandingan hasil deteksi yang berlaku saat ini dengan hasil analisis ulang (baris gigi persis "
        "seperti yang akan disimpan bila Confirm). 409 bila job belum selesai / gagal. Dapat diakses semua role."
    ),
)
async def get_reanalysis_comparison(
    job_id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReanalysisComparisonResponse:
    job = await _get_reanalysis_job(db, job_id)
    if job.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Hasil analisis ulang belum tersedia (status: {job.status})",
        )

    subject_type = await db.scalar(select(Subject.subject_type).where(Subject.id == job.subject_id))
    current = [
        ReanalysisTooth(
            fdi_number=r.fdi_number, bbox=r.bbox, landmarks=r.landmarks,
            morphology_features=r.morphology_features, confidence_score=r.confidence_score,
        )
        for r in await _current_tooth_rows(db, job.dental_image_id)
    ]
    proposed = [
        ReanalysisTooth(**row)
        for row in sorted(tooth_rows_from_result(job.result_payload), key=lambda r: r["fdi_number"])
    ]
    cur_fdi = {t.fdi_number for t in current}
    new_fdi = {t.fdi_number for t in proposed}
    confirmed_matches = await db.scalar(
        select(func.count())
        .select_from(MatchingResult)
        .where(
            MatchingResult.status == "confirmed",
            or_(MatchingResult.pm_subject_id == job.subject_id, MatchingResult.am_subject_id == job.subject_id),
        )
    )

    request.state.resource_type = "inference_jobs"
    request.state.resource_id = job.id
    return ReanalysisComparisonResponse(
        job_id=job.id,
        dental_image_id=job.dental_image_id,
        subject_id=job.subject_id,
        subject_type=subject_type,
        status=job.status,
        review=reanalysis_review(job),
        error_message=job.error_message,
        created_at=job.created_at,
        completed_at=job.completed_at,
        current=current,
        proposed=proposed,
        summary=ReanalysisSummary(
            current_count=len(current),
            proposed_count=len(proposed),
            added=sorted(new_fdi - cur_fdi),
            removed=sorted(cur_fdi - new_fdi),
            kept=sorted(cur_fdi & new_fdi),
        ),
        confirmed_matches=confirmed_matches or 0,
    )


@router.post(
    "/jobs/{job_id}/reanalysis/decision",
    response_model=ReanalysisDecisionResponse,
    summary="Confirm or Reject a Re-analysis Result",
    description=(
        "confirm: hasil analisis ulang menimpa tooth_records citra dan embedding subjek dihitung ulang "
        "(skor kandidat yang sudah ada TIDAK ikut dihitung ulang — jalankan ulang pencarian kandidat). "
        "reject: hasil lama dipertahankan (juga untuk menutup analisis ulang yang gagal). "
        "409 bila sudah diputuskan atau job masih berjalan. Admin & examiner (citra AM: admin saja)."
    ),
)
async def decide_reanalysis(
    job_id: UUID,
    payload: ReanalysisDecisionRequest,
    request: Request,
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReanalysisDecisionResponse:
    job = await _get_reanalysis_job(db, job_id)
    subject_type = await db.scalar(select(Subject.subject_type).where(Subject.id == job.subject_id))
    ensure_can_modify_subject_type(current_user, subject_type)

    # Kunci subjek lalu baca ulang job: dua keputusan bersamaan diproses bergiliran
    await _lock_subject(db, job.subject_id)
    await db.refresh(job, with_for_update=True)

    review = reanalysis_review(job)
    if review != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Hasil analisis ulang ini sudah diputuskan ({review})",
        )
    if job.status in ACTIVE_JOB_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Analisis ulang masih berjalan")
    confirm = payload.decision == "confirm"
    if confirm:
        if job.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Analisis ulang gagal — tidak ada hasil untuk diterapkan (gunakan reject untuk menutupnya)",
            )
        image = await db.get(DentalImage, job.dental_image_id)
        if image is None or image.is_deleted:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Citra telah dihapus")

    now = datetime.now(timezone.utc)
    before = len(await _current_tooth_rows(db, job.dental_image_id))
    new_review = "confirmed" if confirm else "rejected"
    # Dict baru (bukan mutasi in-place) agar SQLAlchemy mendeteksi perubahan kolom JSONB
    job.request_payload = {
        **job.request_payload,
        REANALYSIS_KEY: {
            **job.request_payload[REANALYSIS_KEY],
            "review": new_review,
            "decided_by": str(current_user.id),
            "decided_at": now.isoformat(),
        },
    }
    job.updated_at = now
    after = await _apply_job_result(db, job, now) if confirm else before
    await db.commit()

    request.state.audit_action = "CONFIRM_REANALYSIS" if confirm else "REJECT_REANALYSIS"
    request.state.resource_type = "inference_jobs"
    request.state.resource_id = job.id
    request.state.audit_details = {
        "dental_image_id": str(job.dental_image_id),
        "tooth_count_before": before,
        "tooth_count_after": after,
    }
    return ReanalysisDecisionResponse(
        job_id=job.id,
        dental_image_id=job.dental_image_id,
        review=new_review,
        decided_at=now,
        tooth_count=after,
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
