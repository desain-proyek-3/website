"""
Dentify ORM — Embedding
Mapping ke tabel `embeddings` di schema_phase1.sql.
1 embedding 512-dim per subject (gabungan 3 foto: depan, kiri, kanan).
Menggunakan pgvector via kolom vector(512).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from core.database import Base


class Embedding(Base):
    __tablename__ = "embeddings"

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
        unique=True,  # 1 embedding per subject
    )
    vector = mapped_column(
        Vector(512), nullable=False
    )
    model_version: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    # ── Relationships ───────────────────────────────────────────────
    subject = relationship("Subject", back_populates="embedding")

    def __repr__(self) -> str:
        return f"<Embedding subject={self.subject_id} model={self.model_version}>"
