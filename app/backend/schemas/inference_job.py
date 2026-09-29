"""
Dentify Schemas — Inference Job
Pydantic models untuk pelacakan job inferensi AI.
Validasi ketat sesuai inference_job_status_enum di schema_phase3b_inference.sql.
"""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Sesuai tipe ENUM inference_job_status_enum di database
InferenceJobStatus = Literal["pending", "processing", "completed", "failed"]


class InferenceJobCreate(BaseModel):
    """Payload untuk trigger job inferensi baru."""
    dental_image_id: UUID = Field(
        ...,
        description="ID citra dental yang akan diproses oleh AI service",
    )


class InferenceJobResponse(BaseModel):
    """Representasi respons lengkap data inference job."""
    id: UUID
    dental_image_id: UUID
    subject_id: UUID
    status: InferenceJobStatus
    ai_service_job_id: str | None = None
    request_payload: dict[str, Any] | None = None
    result_payload: dict[str, Any] | None = None
    error_message: str | None = None
    retry_count: int
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class InferenceJobListResponse(BaseModel):
    """Respons daftar inference jobs."""
    items: list[InferenceJobResponse]
    total: int
