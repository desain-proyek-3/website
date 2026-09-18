"""
Dentify Schemas — Dental Image
Pydantic models untuk citra klinis intraoral gigi.
Validasi ketat sesuai view_type_enum dan preprocessing_status_enum di schema_phase1.sql.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Sesuai tipe ENUM di database
ViewType = Literal["depan", "kiri", "kanan"]
PreprocessingStatus = Literal["raw", "processed", "failed"]


class DentalImageResponse(BaseModel):
    """
    Response metadata citra klinis intraoral.
    Menyediakan presigned URL sementara (image_url) untuk akses aman,
    tanpa mengekspos object key atau konfigurasi bucket mentah MinIO.
    """
    id: UUID
    subject_id: UUID
    view_type: ViewType
    file_hash: str = Field(..., description="Hash SHA-256 berkas citra untuk chain-of-custody forensik")
    device_id: str | None = Field(default=None, description="Identifier perangkat scanner NFC")
    preprocessing_status: PreprocessingStatus = Field(default="raw")
    captured_at: datetime | None = Field(default=None, description="Waktu pengambilan citra oleh scanner")
    uploaded_at: datetime
    image_url: str | None = Field(default=None, description="Presigned URL berbatas waktu untuk mengunduh citra")
    is_deleted: bool
    deleted_at: datetime | None = None
    deleted_by: UUID | None = None

    model_config = ConfigDict(from_attributes=True)


class DentalImageListResponse(BaseModel):
    """Daftar metadata citra intraoral."""
    items: list[DentalImageResponse]
    total: int
