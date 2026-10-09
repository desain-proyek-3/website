"""
Dentify API v1 — Inference Endpoints
Trigger inferensi AI dan cek status job.
Role akses:
- Admin & Examiner: POST trigger untuk citra subjek post-mortem
- Admin saja: POST trigger untuk citra milik subjek ante-mortem
- Semua role: GET status job
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import async_session_factory, get_db
from dependencies.auth import ensure_can_modify_subject_type, get_current_user, require_role
from models.dental_image import DentalImage
from models.embedding import Embedding
from models.inference_job import InferenceJob
from models.subject import Subject
from models.tooth_record import ToothRecord
from models.user import User
from schemas.inference_job import (
    InferenceJobCreate,
    InferenceJobResponse,
)
from services.ai_service_client import ai_service_client
from services.storage_service import storage_service

router = APIRouter(prefix="/inference", tags=["Inference"])

logger = logging.getLogger("dentify.inference")

# ── Strong reference set untuk background tasks (pola dari audit_middleware.py) ──
_background_tasks: set[asyncio.Task] = set()


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

                # 1. Simpan subject embedding (512-d vector) jika ada
                subject_embedding = res_payload.get("subject_embedding")
                if subject_embedding and isinstance(subject_embedding, list):
                    stmt_emb = select(Embedding).where(Embedding.subject_id == job.subject_id)
                    emb_res = await session.execute(stmt_emb)
                    existing_emb = emb_res.scalar_one_or_none()

                    if existing_emb:
                        existing_emb.vector = subject_embedding
                        existing_emb.model_version = "ai_engine_v1"
                        existing_emb.generated_at = now
                    else:
                        new_embedding = Embedding(
                            subject_id=job.subject_id,
                            vector=subject_embedding,
                            model_version="ai_engine_v1",
                            generated_at=now,
                        )
                        session.add(new_embedding)

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
                                    morphology_features=tooth.get("morphology") or tooth.get("morphology_features"),
                                    confidence_score=tooth.get("confidence") or tooth.get("confidence_score"),
                                    created_at=now,
                                )
                                session.add(tooth_rec)
            else:
                job.status = "failed"
                job.error_message = result.get("error", "Unknown error from AI service")

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

    # 2. Generate presigned URL dari MinIO untuk diunduh oleh AI service
    presigned_url = storage_service.get_presigned_url(
        object_name=dental_image.file_path,
        expires_seconds=3600,
    )

    # 3. Buat row inference_jobs dengan status pending
    now = datetime.now(timezone.utc)
    new_job = InferenceJob(
        dental_image_id=dental_image.id,
        subject_id=dental_image.subject_id,
        status="pending",
        request_payload={
            "dental_image_id": str(dental_image.id),
            "subject_id": str(dental_image.subject_id),
            "image_url": presigned_url,
            "image_path": dental_image.file_path,
        },
        retry_count=0,
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
    )

    db.add(new_job)
    # Commit (bukan hanya flush) SEBELUM create_task: background task memakai
    # session/koneksi sendiri dan hanya bisa melihat row yang sudah di-commit.
    # Tanpa ini job kadang tidak ditemukan dan tertahan 'pending' selamanya.
    await db.commit()
    await db.refresh(new_job)

    # 4. Set metadata untuk audit_middleware
    request.state.audit_action = "TRIGGER_INFERENCE"
    request.state.resource_type = "inference_jobs"
    request.state.resource_id = new_job.id

    # 5. Trigger ke AI service di background, lalu polling
    async def _trigger_and_poll(job_id: UUID, image_url: str) -> None:
        """Trigger AI service lalu polling sampai selesai."""
        try:
            # Trigger
            async with async_session_factory() as session:
                stmt = select(InferenceJob).where(InferenceJob.id == job_id)
                db_result = await session.execute(stmt)
                job = db_result.scalar_one_or_none()
                if not job:
                    # Seharusnya tidak terjadi lagi sejak trigger_inference commit
                    # sebelum create_task; kalau muncul, job akan tertahan 'pending'.
                    logger.error(
                        "[INFERENCE_BG] Job %s tidak terlihat oleh background task — "
                        "AI service tidak dipanggil, job akan tertahan 'pending'",
                        job_id,
                    )
                    return

                try:
                    trigger_result = await ai_service_client.trigger_inference(
                        dental_image_id=job.dental_image_id,
                        subject_id=job.subject_id,
                        image_url=image_url,
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

        except Exception as e:
            print(f"[INFERENCE_BG] Unexpected error in _trigger_and_poll for job {job_id}: {e}")

    task = asyncio.create_task(
        _trigger_and_poll(new_job.id, presigned_url)
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return InferenceJobResponse.model_validate(new_job)


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
