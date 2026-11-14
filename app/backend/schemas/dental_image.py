"""
Dentify Schemas — Dental Image
Pydantic models untuk citra klinis intraoral gigi.
Validasi ketat sesuai view_type_enum dan preprocessing_status_enum di schema_phase1.sql.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from services.inference_status import AiStatus, ImageAiStatus

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
    ai_status: AiStatus = Field(
        default="none", description="Status job inferensi TERAKHIR citra ini ('none' = belum pernah dijalankan)"
    )
    ai_processed: bool = Field(default=False, description="Pernah ada job inferensi 'completed' untuk citra ini")
    latest_job_id: UUID | None = None
    ai_error_message: str | None = Field(default=None, description="Pesan error job terakhir bila 'failed'")

    model_config = ConfigDict(from_attributes=True)

    def with_ai_status(self, st: "ImageAiStatus | None") -> "DentalImageResponse":
        if st is not None:
            self.ai_status = st.status
            self.ai_processed = st.processed
            self.latest_job_id = st.latest_job_id
            self.ai_error_message = st.error_message
        return self


class DentalImageListResponse(BaseModel):
    """Daftar metadata citra intraoral."""
    items: list[DentalImageResponse]
    total: int


class UnprocessedImage(BaseModel):
    """Citra aktif yang belum pernah berhasil diproses AI (tanpa job 'completed')."""
    id: UUID
    subject_id: UUID
    subject_type: Literal["ante_mortem", "post_mortem"]
    subject_name: str | None = None
    case_reference: str | None = None
    view_type: ViewType
    uploaded_at: datetime
    ai_status: AiStatus = "none"
    latest_job_id: UUID | None = None
    ai_error_message: str | None = None


class UnprocessedImageListResponse(BaseModel):
    items: list[UnprocessedImage]
    total: int = Field(..., description="Jumlah sesuai filter")
    counts: dict[str, int] = Field(..., description="Jumlah per tipe subjek (tanpa filter): ante_mortem, post_mortem")
    limit: int
    offset: int
