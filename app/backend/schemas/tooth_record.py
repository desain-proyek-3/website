"""
Dentify Schemas — Tooth Record
Pydantic models untuk hasil deteksi per gigi (output AI) pada sebuah citra intraoral.
Format bbox/landmarks/morphology_features mengikuti payload AI service apa adanya
(kontrak belum dikunci — lihat integration.md §6).
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ToothRecordResponse(BaseModel):
    """Satu gigi terdeteksi (notasi FDI 11–48) pada citra dental."""
    id: UUID
    dental_image_id: UUID
    fdi_number: int
    bbox: Any | None = None
    landmarks: Any | None = None
    morphology_features: Any | None = None
    confidence_score: float | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ToothRecordListResponse(BaseModel):
    """Daftar gigi terdeteksi untuk satu citra."""
    items: list[ToothRecordResponse]
    total: int
