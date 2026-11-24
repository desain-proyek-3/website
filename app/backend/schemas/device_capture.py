"""
Dentify Schemas — Device Capture (Inbox foto dari alat ESP32)
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from schemas.dental_image import ViewType

CaptureStatus = Literal["pending", "assigned", "discarded"]


class DeviceCaptureIngestResponse(BaseModel):
    """Balasan ke alat setelah foto diterima (dicetak firmware di Serial Monitor)."""
    capture_id: UUID
    device_id: str = Field(..., description="device_code alat pengirim")
    sha256: str
    size: int
    captured_at: datetime | None = None
    received_at: datetime
    status: CaptureStatus


class DeviceCaptureResponse(BaseModel):
    """Satu foto di Inbox."""
    id: UUID
    device_code: str
    device_name: str | None = None
    file_hash: str = Field(..., description="SHA-256, diverifikasi saat diterima dari alat")
    file_size: int
    original_filename: str | None = None
    view_type_hint: ViewType | None = None
    captured_at: datetime | None = Field(default=None, description="Waktu ambil menurut jam alat (NTP)")
    received_at: datetime
    status: CaptureStatus
    dental_image_id: UUID | None = None
    assigned_at: datetime | None = None
    deleted_at: datetime | None = None
    image_url: str | None = Field(default=None, description="Presigned URL thumbnail/preview")


class DeviceCaptureListResponse(BaseModel):
    items: list[DeviceCaptureResponse]
    total: int
    limit: int
    offset: int


class DeviceCaptureAssignRequest(BaseModel):
    subject_id: UUID
    view_type: ViewType


class AssignableSubject(BaseModel):
    """Subjek aktif yang citranya belum lengkap (< 3 sudut)."""
    id: UUID
    subject_type: Literal["ante_mortem", "post_mortem"]
    full_name: str | None = None
    case_reference: str | None = None
    created_at: datetime
    filled_views: list[ViewType] = Field(default_factory=list)


class AssignableSubjectListResponse(BaseModel):
    items: list[AssignableSubject]
    total: int
