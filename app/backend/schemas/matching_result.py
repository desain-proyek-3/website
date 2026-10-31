"""
Dentify Schemas — Matching Result
Pydantic models untuk hasil pencocokan biometrik AM vs PM (similarity search pgvector).
Status sesuai ENUM matching_status_enum di schema_phase1.sql.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Sesuai tipe ENUM matching_status_enum di database
MatchingStatus = Literal["pending_review", "confirmed", "rejected"]

# Keputusan tim: kembalikan 3 subjek AM dengan confidence tertinggi
DEFAULT_TOP_K = 3
MAX_TOP_K = 10


class MatchingRunRequest(BaseModel):
    """Payload untuk menjalankan pencocokan 1:N satu subjek PM terhadap seluruh subjek AM."""
    pm_subject_id: UUID = Field(..., description="ID subjek post-mortem yang akan dicocokkan")
    top_k: int = Field(
        default=DEFAULT_TOP_K,
        ge=1,
        le=MAX_TOP_K,
        description="Jumlah kandidat AM teratas yang dikembalikan & disimpan",
    )


class MatchingConfirmRequest(BaseModel):
    """Payload keputusan odontolog (human-in-the-loop) atas satu kandidat."""
    decision: Literal["confirmed", "rejected"] = Field(
        ..., description="Keputusan reviewer: 'confirmed' atau 'rejected'"
    )


class MatchingSubjectSummary(BaseModel):
    """Ringkasan subjek (AM/PM) yang disertakan pada hasil pencocokan."""
    id: UUID
    subject_type: Literal["ante_mortem", "post_mortem"]
    full_name: str | None = None
    case_reference: str | None = None

    model_config = ConfigDict(from_attributes=True)


class MatchingResultResponse(BaseModel):
    """Representasi satu baris hasil pencocokan PM ↔ AM."""
    id: UUID
    pm_subject_id: UUID
    am_subject_id: UUID
    pm_subject: MatchingSubjectSummary
    am_subject: MatchingSubjectSummary
    cosine_similarity: float | None = Field(
        default=None, description="Cosine similarity embedding PM vs AM (-1..1)"
    )
    superimposition_score: float | None = None
    morphology_diff_score: float | None = None
    confidence_score: float | None = Field(
        default=None, description="Confidence dalam persen (0–100) = max(cosine, 0) × 100"
    )
    rank: int | None = Field(default=None, description="Peringkat kandidat dalam hasil 1:N (1 = teratas)")
    matched_by: UUID | None = Field(default=None, description="User yang menjalankan pencocokan")
    status: MatchingStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("confidence_score")
    @classmethod
    def _round_confidence(cls, v: float | None) -> float | None:
        # Kolom REAL (float32) → 85.91000366...; cukup 2 desimal untuk persen
        return None if v is None else round(v, 2)


class MatchingRunResponse(BaseModel):
    """Respons pencocokan: kandidat AM terurut dari confidence tertinggi."""
    pm_subject_id: UUID
    top_k: int
    candidates: list[MatchingResultResponse]


class MatchingResultListResponse(BaseModel):
    """Respons paginasi daftar hasil pencocokan."""
    items: list[MatchingResultResponse]
    total: int
    limit: int
    offset: int
