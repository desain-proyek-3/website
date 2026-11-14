"""
Dentify Services — Status AI per citra
Ringkasan status inferensi AI setiap citra dari tabel `inference_jobs`:
- ai_status     : status job TERAKHIR untuk citra itu ("none" bila belum pernah dijalankan)
- ai_processed  : pernah ada job `completed` (hasil deteksi/embedding tersedia)
Dipakai untuk menemukan citra lama yang belum diproses AI (mis. dataset hasil migrasi
atau citra yang diunggah lewat "Upload tanpa AI") dan memprosesnya ulang.
"""

from dataclasses import dataclass
from typing import Iterable, Literal
from uuid import UUID

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.dental_image import DentalImage
from models.inference_job import InferenceJob

AiStatus = Literal["none", "pending", "processing", "completed", "failed"]
ACTIVE_JOB_STATUSES = ("pending", "processing")


@dataclass
class ImageAiStatus:
    status: AiStatus = "none"
    latest_job_id: UUID | None = None
    processed: bool = False
    error_message: str | None = None


def completed_job_exists():
    """Kondisi SQL: citra (DentalImage) sudah punya minimal satu job `completed`."""
    return exists().where(
        InferenceJob.dental_image_id == DentalImage.id,
        InferenceJob.status == "completed",
    )


async def ai_status_for_images(db: AsyncSession, image_ids: Iterable[UUID]) -> dict[UUID, ImageAiStatus]:
    ids = list(image_ids)
    statuses = {image_id: ImageAiStatus() for image_id in ids}
    if not ids:
        return statuses

    latest = (
        await db.execute(
            select(
                InferenceJob.dental_image_id,
                InferenceJob.id,
                InferenceJob.status,
                InferenceJob.error_message,
            )
            .where(InferenceJob.dental_image_id.in_(ids))
            .distinct(InferenceJob.dental_image_id)
            .order_by(InferenceJob.dental_image_id, InferenceJob.created_at.desc(), InferenceJob.id.desc())
        )
    ).all()
    for row in latest:
        st = statuses[row.dental_image_id]
        st.status = row.status
        st.latest_job_id = row.id
        st.error_message = row.error_message if row.status == "failed" else None

    processed_ids = (
        await db.execute(
            select(InferenceJob.dental_image_id)
            .where(InferenceJob.dental_image_id.in_(ids), InferenceJob.status == "completed")
            .distinct()
        )
    ).scalars().all()
    for image_id in processed_ids:
        statuses[image_id].processed = True

    return statuses
