"""
Dentify Schemas — Audit Log
Pydantic models untuk request, response, dan hasil verifikasi audit log.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    """Representasi satu entri audit log."""
    id: UUID
    timestamp: datetime
    user_id: UUID | None
    action: str
    resource_type: str
    resource_id: UUID | None
    method: str
    endpoint: str
    status_code: int
    ip_address: str | None
    details: dict[str, Any] | None
    entry_hash: str
    previous_hash: str | None

    model_config = ConfigDict(from_attributes=True)


class AuditLogListResponse(BaseModel):
    """Response paginasi daftar audit logs."""
    items: list[AuditLogResponse]
    total: int
    limit: int
    offset: int


class CorruptedEntry(BaseModel):
    """Detail entri audit log yang terdeteksi rusak atau dimodifikasi."""
    index: int
    id: UUID
    timestamp: datetime
    reason: str
    expected_hash: str | None = None
    stored_hash: str | None = None


class AuditVerifyResponse(BaseModel):
    """Hasil verifikasi integritas hash-chain audit log."""
    is_valid: bool
    total_entries: int
    verified_at: datetime
    corrupted_entries: list[CorruptedEntry]
