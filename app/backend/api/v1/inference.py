"""
Dentify API v1 — Inference Endpoints
Trigger inferensi AI dan cek status job.
Role akses:
- Admin & Examiner: POST trigger
- Semua role: GET status job
"""

import asyncio
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import async_session_factory, get_db
from dependencies.auth import get_current_user, require_role
from models.dental_image import DentalImage
from models.inference_job import InferenceJob
from models.user import User
from schemas.inference_job import (
    InferenceJobCreate,
    InferenceJobResponse,
)
from services.ai_service_client import ai_service_client

router = APIRouter(prefix="/inference", tags=["Inference"])

# ── Strong reference set untuk background tasks (pola dari audit_middleware.py) ──
_background_tasks: set[asyncio.Task] = set()


async def _poll_and_update_job(job_id: UUID, ai_job_id: str) -> None:
    """
    Background task: polling status job ke AI service, lalu update DB.
    Buka session database sendiri (BUKAN reuse session request yang sudah closed).
    """
    try:
        result = await ai_service_client.poll_until_complete(ai_job_id)

        # TODO: Mapping field dari response AI service masih asumsi.
        #       Sesuaikan setelah kontrak final dikonfirmasi dengan Bonifasius.
        ai_status = result.get("status", "failed").lower()
        now = datetime.now(timezone.utc)

        async with async_session_factory() as session:
            stmt = select(InferenceJob).where(InferenceJob.id == job_id)
            db_result = await session.execute(stmt)
            job = db_result.scalar_one_or_none()

            if not job:
                print(f"[INFERENCE_BG] Job {job_id} tidak ditemukan di DB")
                return

            if ai_status == "completed":
                job.status = "completed"
                # TODO: Field "result" masih asumsi — bisa berisi DentalScanOutput
                job.result_payload = result.get("result")
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

    # 2. Buat row inference_jobs dengan status pending
    now = datetime.now(timezone.utc)
    new_job = InferenceJob(
        dental_image_id=dental_image.id,
        subject_id=dental_image.subject_id,
        status="pending",
        request_payload={
            "dental_image_id": str(dental_image.id),
            "subject_id": str(dental_image.subject_id),
            "image_path": dental_image.file_path,
        },
        retry_count=0,
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
    )

    db.add(new_job)
    await db.flush()
    await db.refresh(new_job)

    # 3. Set metadata untuk audit_middleware
    request.state.audit_action = "TRIGGER_INFERENCE"
    request.state.resource_type = "inference_jobs"
    request.state.resource_id = new_job.id

    # 4. Trigger ke AI service di background, lalu polling
    #    Pola strong-reference SAMA PERSIS seperti audit_middleware.py
    async def _trigger_and_poll(job_id: UUID, image_path: str) -> None:
        """Trigger AI service lalu polling sampai selesai."""
        try:
            # Trigger
            async with async_session_factory() as session:
                stmt = select(InferenceJob).where(InferenceJob.id == job_id)
                db_result = await session.execute(stmt)
                job = db_result.scalar_one_or_none()
                if not job:
                    return

                try:
                    trigger_result = await ai_service_client.trigger_inference(
                        dental_image_id=job.dental_image_id,
                        subject_id=job.subject_id,
                        image_file_path=image_path,
                    )
                    # TODO: Field "job_id" dari response AI service masih asumsi
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
        _trigger_and_poll(new_job.id, dental_image.file_path)
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
