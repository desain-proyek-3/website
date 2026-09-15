"""
Dentify ORM — MatchingResult
Mapping ke tabel `matching_results` di schema_phase1.sql.
Hasil pencocokan AM vs PM (Matching Engine).
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, SmallInteger
from sqlalchemy.types import REAL
from sqlalchemy.dialects.postgresql import UUID
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
