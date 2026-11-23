"""
Dentify Services — Status AI per citra
Ringkasan status inferensi AI setiap citra dari tabel `inference_jobs`:
- ai_status     : status job TERAKHIR yang hasilnya berlaku ("none" bila belum pernah dijalankan)
- ai_processed  : pernah ada job `completed` yang hasilnya berlaku (hasil deteksi/embedding tersedia)
- active        : ada job `pending`/`processing` untuk citra itu (termasuk analisis ulang)
- reanalysis    : analisis ulang terakhir yang belum diputuskan (berjalan / menunggu keputusan / gagal)
Dipakai untuk menemukan citra lama yang belum diproses AI (mis. dataset hasil migrasi) dan
memprosesnya ulang, serta untuk alur "Analisis ulang" di Feature analysis.

Analisis ulang (Pekan 13): job ditandai `request_payload.reanalysis = {"review": ...}`.
Hasilnya disimpan di `result_payload` tetapi TIDAK diterapkan (tooth_records / embedding)
sampai pengguna memilih Confirm. Job seperti itu hanya dianggap "berlaku" bila
`review == "confirmed"` — lihat `applied_job_condition()`.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Literal
from uuid import UUID

from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.dental_image import DentalImage
from models.inference_job import InferenceJob

AiStatus = Literal["none", "pending", "processing", "completed", "failed"]
ReviewState = Literal["pending", "confirmed", "rejected"]
ACTIVE_JOB_STATUSES = ("pending", "processing")
REANALYSIS_KEY = "reanalysis"


def is_reanalysis_job(job: InferenceJob) -> bool:
    return isinstance(job.request_payload, dict) and isinstance(job.request_payload.get(REANALYSIS_KEY), dict)


def reanalysis_review(job: InferenceJob) -> ReviewState | None:
    return job.request_payload[REANALYSIS_KEY].get("review") if is_reanalysis_job(job) else None


def is_reanalysis_condition():
    """Kondisi SQL: job adalah analisis ulang."""
    return InferenceJob.request_payload.has_key(REANALYSIS_KEY)


def applied_job_condition():
    """Kondisi SQL: hasil job berlaku — bukan analisis ulang, atau analisis ulang yang sudah dikonfirmasi."""
    return or_(
        InferenceJob.request_payload.is_(None),
        ~InferenceJob.request_payload.has_key(REANALYSIS_KEY),
        InferenceJob.request_payload[REANALYSIS_KEY]["review"].astext == "confirmed",
    )


@dataclass
class ImageReanalysis:
    job_id: UUID
    status: AiStatus
    review: ReviewState
    error_message: str | None
    created_at: datetime


@dataclass
class ImageAiStatus:
    status: AiStatus = "none"
    latest_job_id: UUID | None = None
    processed: bool = False
    error_message: str | None = None
    active: bool = False
    reanalysis: ImageReanalysis | None = None


def completed_job_exists():
    """Kondisi SQL: citra (DentalImage) sudah punya minimal satu job `completed` yang hasilnya berlaku."""
    return exists().where(
        InferenceJob.dental_image_id == DentalImage.id,
        InferenceJob.status == "completed",
        applied_job_condition(),
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
            .where(InferenceJob.dental_image_id.in_(ids), applied_job_condition())
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
            .where(
                InferenceJob.dental_image_id.in_(ids),
                InferenceJob.status == "completed",
                applied_job_condition(),
            )
            .distinct()
        )
    ).scalars().all()
    for image_id in processed_ids:
        statuses[image_id].processed = True

    active_ids = (
        await db.execute(
            select(InferenceJob.dental_image_id)
            .where(InferenceJob.dental_image_id.in_(ids), InferenceJob.status.in_(ACTIVE_JOB_STATUSES))
            .distinct()
        )
    ).scalars().all()
    for image_id in active_ids:
        statuses[image_id].active = True

    # Analisis ulang terakhir per citra — dilaporkan hanya bila belum diputuskan
    reanalyses = (
        await db.execute(
            select(InferenceJob)
            .where(InferenceJob.dental_image_id.in_(ids), is_reanalysis_condition())
            .distinct(InferenceJob.dental_image_id)
            .order_by(InferenceJob.dental_image_id, InferenceJob.created_at.desc(), InferenceJob.id.desc())
        )
    ).scalars().all()
    for job in reanalyses:
        if reanalysis_review(job) == "pending":
            statuses[job.dental_image_id].reanalysis = ImageReanalysis(
                job_id=job.id,
                status=job.status,
                review="pending",
                error_message=job.error_message if job.status == "failed" else None,
                created_at=job.created_at,
            )

    return statuses
