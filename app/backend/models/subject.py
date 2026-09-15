"""
Dentify ORM — Subject
Mapping ke tabel `subjects` di schema_phase1.sql.
Entitas orang: ante-mortem (AM) dan post-mortem (PM) digabung di tabel ini.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="uuid_generate_v4()",
    )
    subject_type: Mapped[str] = mapped_column(
        Enum("ante_mortem", "post_mortem", name="subject_type_enum", create_type=False),
        nullable=False,
    )
    full_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True  # PM bisa "unknown"
    )
    case_reference: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    # ── Relationships ───────────────────────────────────────────────
    creator = relationship("User", back_populates="subjects")
    dental_images = relationship(
        "DentalImage", back_populates="subject", cascade="all, delete-orphan"
    )
    embedding = relationship(
        "Embedding", back_populates="subject", uselist=False, cascade="all, delete-orphan"
    )
    pm_matching_results = relationship(
        "MatchingResult",
        foreign_keys="MatchingResult.pm_subject_id",
        back_populates="pm_subject",
    )
    am_matching_results = relationship(
        "MatchingResult",
        foreign_keys="MatchingResult.am_subject_id",
        back_populates="am_subject",
    )

    def __repr__(self) -> str:
        return f"<Subject {self.id} ({self.subject_type})>"
