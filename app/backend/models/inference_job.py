"""
Dentify ORM — InferenceJob
Mapping ke tabel `inference_jobs` di schema_phase3b_inference.sql.
Pelacakan job inferensi yang dikirim ke AI microservice terpisah.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class InferenceJob(Base):
    __tablename__ = "inference_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="uuid_generate_v4()",
    )
    dental_image_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dental_images.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        Enum(
            "pending", "processing", "completed", "failed",
            name="inference_job_status_enum",
            create_type=False,
        ),
        nullable=False,
        server_default="pending",
    )
    ai_service_job_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    request_payload: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )
    result_payload: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    retry_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
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
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relationships ───────────────────────────────────────────────
    dental_image = relationship("DentalImage", foreign_keys=[dental_image_id])
    subject = relationship("Subject", foreign_keys=[subject_id])
    creator = relationship("User", foreign_keys=[created_by])

    def __repr__(self) -> str:
        return f"<InferenceJob {self.id} ({self.status})>"
