"""
Dentify Schemas — Dental Image
Pydantic models untuk citra klinis intraoral gigi.
Validasi ketat sesuai view_type_enum dan preprocessing_status_enum di schema_phase1.sql.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from services.inference_status import AiStatus, ImageAiStatus, ReviewState

# Sesuai tipe ENUM di database
ViewType = Literal["depan", "kiri", "kanan"]
PreprocessingStatus = Literal["raw", "processed", "failed"]


class ImageReanalysisInfo(BaseModel):
    """Analisis ulang terakhir citra yang belum diputuskan (lihat POST /inference/reanalyze)."""
    job_id: UUID
    status: AiStatus = Field(..., description="pending/processing = berjalan, completed = menunggu keputusan, failed = gagal")
    review: ReviewState = "pending"
    error_message: str | None = None
    created_at: datetime


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
        default="none",
        description="Status job inferensi TERAKHIR yang hasilnya berlaku ('none' = belum pernah dijalankan); "
        "analisis ulang yang belum dikonfirmasi dilaporkan terpisah di `reanalysis`",
    )
    ai_processed: bool = Field(default=False, description="Pernah ada job inferensi 'completed' yang hasilnya berlaku")
    latest_job_id: UUID | None = None
    ai_error_message: str | None = Field(default=None, description="Pesan error job terakhir bila 'failed'")
    ai_active: bool = Field(default=False, description="Ada job pending/processing untuk citra ini (termasuk analisis ulang)")
    reanalysis: ImageReanalysisInfo | None = Field(
        default=None, description="Analisis ulang yang belum diputuskan (berjalan / menunggu Confirm-Reject / gagal)"
    )

    model_config = ConfigDict(from_attributes=True)

    def with_ai_status(self, st: "ImageAiStatus | None") -> "DentalImageResponse":
        if st is not None:
            self.ai_status = st.status
            self.ai_processed = st.processed
            self.latest_job_id = st.latest_job_id
            self.ai_error_message = st.error_message
            self.ai_active = st.active
            r = st.reanalysis
            self.reanalysis = (
                ImageReanalysisInfo(
                    job_id=r.job_id, status=r.status, review=r.review,
                    error_message=r.error_message, created_at=r.created_at,
                )
                if r
                else None
            )
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
