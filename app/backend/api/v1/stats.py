"""
Dentify API v1 — Stats Endpoints
Agregat ringkas untuk Dashboard frontend dalam satu request (menghindari
Dashboard memanggil /subjects/{id}/images per subjek).
Hanya data aktif (bukan soft-deleted) yang dihitung, kecuali inference_jobs
yang dihitung seluruhnya sebagai riwayat pemrosesan AI.
Role akses: semua role.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from core.database import get_db
from dependencies.auth import get_current_user
from models.dental_image import DentalImage
from models.embedding import Embedding
from models.inference_job import InferenceJob
from models.matching_result import MatchingResult
from models.subject import Subject
from models.user import User
from schemas.stats import (
    InferenceJobCounts,
    MatchingCounts,
    StatsSummaryResponse,
    SubjectTypeCounts,
)

router = APIRouter(prefix="/stats", tags=["Stats"])


@router.get(
    "/summary",
    response_model=StatsSummaryResponse,
    summary="Dashboard Summary",
    description="Jumlah subjek, citra, embedding, job inferensi, dan hasil pencocokan. Dapat diakses semua role.",
)
async def get_stats_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StatsSummaryResponse:
    """Ambil ringkasan agregat untuk Dashboard."""
    subject_rows = await db.execute(
        select(Subject.subject_type, func.count())
        .where(Subject.is_deleted == False)
        .group_by(Subject.subject_type)
    )

    image_total = await db.scalar(
        select(func.count())
        .select_from(DentalImage)
        .join(Subject, Subject.id == DentalImage.subject_id)
        .where(DentalImage.is_deleted == False, Subject.is_deleted == False)
    )

    embedding_rows = await db.execute(
        select(Subject.subject_type, func.count())
        .select_from(Embedding)
        .join(Subject, Subject.id == Embedding.subject_id)
        .where(Subject.is_deleted == False)
        .group_by(Subject.subject_type)
    )

    job_rows = await db.execute(
        select(InferenceJob.status, func.count()).group_by(InferenceJob.status)
    )

    pm = aliased(Subject)
    am = aliased(Subject)
    matching_rows = await db.execute(
        select(MatchingResult.status, func.count())
        .join(pm, MatchingResult.pm_subject_id == pm.id)
        .join(am, MatchingResult.am_subject_id == am.id)
        .where(pm.is_deleted == False, am.is_deleted == False)
        .group_by(MatchingResult.status)
    )

    return StatsSummaryResponse(
        subjects=SubjectTypeCounts(**dict(subject_rows.all())),
        dental_images=image_total or 0,
        embeddings=SubjectTypeCounts(**dict(embedding_rows.all())),
        inference_jobs=InferenceJobCounts(**dict(job_rows.all())),
        matching_results=MatchingCounts(**dict(matching_rows.all())),
    )
