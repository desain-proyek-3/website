"""
Dentify Schemas — Stats
Pydantic models untuk ringkasan agregat Dashboard (GET /api/v1/stats/summary).
Setiap kategori selalu dikembalikan lengkap (default 0), walau belum ada datanya.
"""

from pydantic import BaseModel


class SubjectTypeCounts(BaseModel):
    """Jumlah per tipe subjek (sesuai subject_type_enum)."""
    ante_mortem: int = 0
    post_mortem: int = 0


class InferenceJobCounts(BaseModel):
    """Jumlah job inferensi per status (sesuai inference_job_status_enum)."""
    pending: int = 0
    processing: int = 0
    completed: int = 0
    failed: int = 0


class MatchingCounts(BaseModel):
    """Jumlah hasil pencocokan per status (sesuai matching_status_enum)."""
    pending_review: int = 0
    confirmed: int = 0
    rejected: int = 0


class StatsSummaryResponse(BaseModel):
    """Ringkasan agregat untuk Dashboard."""
    subjects: SubjectTypeCounts
    dental_images: int
    embeddings: SubjectTypeCounts
    inference_jobs: InferenceJobCounts
    matching_results: MatchingCounts
