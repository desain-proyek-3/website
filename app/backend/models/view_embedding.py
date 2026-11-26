"""
Dentify ORM — ViewEmbedding
Mapping ke tabel `view_embeddings` di schema_phase6_view_matching.sql.
1 embedding 512-dim per CITRA aktif (sudut depan/kiri/kanan) = `subject_embedding` job
inferensi terbaru yang berlaku untuk citra itu. Dipakai pencocokan per sudut
(services/view_matching.py): PM sudut X hanya dibandingkan dengan AM sudut X.
Disinkronkan oleh services/subject_embedding.recompute_subject_embedding.
"""

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class ViewEmbedding(Base):
    __tablename__ = "view_embeddings"

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
        unique=True,  # 1 embedding per citra
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
    vector = mapped_column(Vector(512), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    def __repr__(self) -> str:
        return f"<ViewEmbedding subject={self.subject_id} view={self.view_type}>"
