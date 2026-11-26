"""
Dentify ORM — MatchingResult
Mapping ke tabel `matching_results` di schema_phase1.sql.
Hasil pencocokan AM vs PM (Matching Engine).
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, SmallInteger, String
from sqlalchemy.types import REAL
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class MatchingResult(Base):
    __tablename__ = "matching_results"
    __table_args__ = (
        CheckConstraint(
            "pm_subject_id != am_subject_id",
            name="chk_pm_is_post_mortem",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="uuid_generate_v4()",
    )
    pm_subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id"),
        nullable=False,
        index=True,
    )
    am_subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id"),
        nullable=False,
        index=True,
    )
    cosine_similarity: Mapped[float | None] = mapped_column(
        REAL, nullable=True
    )
    superimposition_score: Mapped[float | None] = mapped_column(
        REAL, nullable=True
    )
    morphology_diff_score: Mapped[float | None] = mapped_column(
        REAL, nullable=True
    )
    confidence_score: Mapped[float | None] = mapped_column(
        REAL, nullable=True
    )
    rank: Mapped[int | None] = mapped_column(
        SmallInteger, nullable=True  # ranking kandidat dalam hasil 1:N
    )
    matched_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        Enum(
            "pending_review", "confirmed", "rejected",
            name="matching_status_enum",
            create_type=False,
        ),
        nullable=False,
        server_default="pending_review",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )
    # Pencocokan per sudut (schema_phase6_view_matching.sql); NULL = baris metode lama
    # (rata-rata embedding subjek). view_scores = {"depan": {"cos": 0.93, "rank": 1}, ...}
    view_scores: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True), nullable=True)
    views_compared: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    match_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Narasi Agentic RAG laporan identifikasi (schema_phase5_report_narrative.sql) —
    # dibuat sekali, dipakai ulang agar isi laporan cetak selalu sama.
    report_narrative: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True  # None → SQL NULL (bukan JSON 'null')
    )
    report_narrative_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relationships ───────────────────────────────────────────────
    pm_subject = relationship(
        "Subject", foreign_keys=[pm_subject_id], back_populates="pm_matching_results"
    )
    am_subject = relationship(
        "Subject", foreign_keys=[am_subject_id], back_populates="am_matching_results"
    )
    matcher = relationship("User", back_populates="matching_results")

    def __repr__(self) -> str:
        return f"<MatchingResult PM={self.pm_subject_id} vs AM={self.am_subject_id} ({self.status})>"
