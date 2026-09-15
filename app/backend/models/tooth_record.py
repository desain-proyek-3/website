"""
Dentify ORM — ToothRecord
Mapping ke tabel `tooth_records` di schema_phase1.sql.
Hasil deteksi per gigi (Faster R-CNN + HRNet), granularitas per FDI number.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, SmallInteger
from sqlalchemy.types import REAL
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class ToothRecord(Base):
    __tablename__ = "tooth_records"
    __table_args__ = (
        CheckConstraint("fdi_number BETWEEN 11 AND 48", name="tooth_records_fdi_number_check"),
    )

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
    fdi_number: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, index=True
    )
    bbox: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True  # {x, y, width, height}
    )
    mask_data: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True  # opsional: mask segmentasi
    )
    landmarks: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True  # array 6 titik anatomi (HRNet-W32)
    )
    morphology_features: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True  # diastema, rotasi, restorasi, missing, crowding
    )
    confidence_score: Mapped[float | None] = mapped_column(
        REAL, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    # ── Relationships ───────────────────────────────────────────────
    dental_image = relationship("DentalImage", back_populates="tooth_records")

    def __repr__(self) -> str:
        return f"<ToothRecord FDI-{self.fdi_number} (image={self.dental_image_id})>"
