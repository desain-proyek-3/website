"""
Dentify ORM — AuditLog
Mapping ke tabel `audit_logs` di schema_phase2_audit.sql.
Pencatatan tamper-evident audit log forensik dengan SHA-256 hash-chaining.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="uuid_generate_v4()",
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default="now()",
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    resource_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    resource_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    method: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )
    endpoint: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    status_code: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    ip_address: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
    )
    details: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    entry_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    previous_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    # ── Relationships ───────────────────────────────────────────────
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<AuditLog {self.id} {self.action} {self.status_code}>"
