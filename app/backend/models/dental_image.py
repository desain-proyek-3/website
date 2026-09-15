"""
Dentify ORM — DentalImage
Mapping ke tabel `dental_images` di schema_phase1.sql.
3 foto intraoral per subject: depan, kiri, kanan.
File fisik di MinIO, kolom ini hanya referensi + metadata.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class DentalImage(Base):
    __tablename__ = "dental_images"
    __table_args__ = (
        UniqueConstraint("subject_id", "view_type", name="uq_subject_view"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="uuid_generate_v4()",
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    view_type: Mapped[str] = mapped_column(
        Enum("depan", "kiri", "kanan", name="view_type_enum", create_type=False),
        nullable=False,
    )
    file_path: Mapped[str] = mapped_column(
        Text, nullable=False  # referensi object key di MinIO
    )
    file_hash: Mapped[str] = mapped_column(
        String(64), nullable=False  # SHA-256, chain-of-custody
    )
    device_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True  # device_id dari NFC scanner (opsional)
    )
    preprocessing_status: Mapped[str] = mapped_column(
        Enum("raw", "processed", "failed", name="preprocessing_status_enum", create_type=False),
        nullable=False,
        server_default="raw",
    )
    captured_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    # ── Relationships ───────────────────────────────────────────────
    subject = relationship("Subject", back_populates="dental_images")
    tooth_records = relationship(
        "ToothRecord", back_populates="dental_image", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<DentalImage {self.id} ({self.view_type})>"
