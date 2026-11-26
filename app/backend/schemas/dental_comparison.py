"""
Dentify Schemas — Dental Comparison & Identification Report
Perbandingan gigi PM vs AM per FDI (GET /matching-results/{id}/comparison) dan
laporan identifikasi format INTERPOL DVI (GET /matching-results/{id}/report).
Logika perbandingan ada di services/dental_comparison.py.
"""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from schemas.matching_result import MatchingResultResponse, MatchingStatus

ToothStatus = Literal["consistent", "discrepant", "pm_only", "am_only"]
FeatureStatus = Literal["same", "different", "pm_only", "am_only"]


class FeatureDelta(BaseModel):
    feature: str
    pm: Any = None
    am: Any = None
    delta: float | None = Field(default=None, description="PM − AM untuk fitur numerik")
    status: FeatureStatus


class ToothSide(BaseModel):
    confidence: float | None = Field(default=None, description="Confidence deteksi tertinggi (persen 0–100)")
    views: list[str] = Field(default_factory=list, description="Sudut citra tempat gigi terdeteksi")
    morphology: dict[str, Any] = Field(default_factory=dict)


class ToothComparison(BaseModel):
    fdi_number: int
    status: ToothStatus
    pm: ToothSide | None = None
    am: ToothSide | None = None
    features: list[FeatureDelta] = Field(default_factory=list)


class ComparisonSummary(BaseModel):
    consistent: int
    discrepant: int
    pm_only: int
    am_only: int
    features_compared: int
    features_different: int


class ImageCoverage(BaseModel):
    """Status AI satu citra yang ikut dibandingkan."""
    dental_image_id: UUID
    view_type: str
    teeth_detected: int


class SubjectCoverage(BaseModel):
    subject_id: UUID
    images: list[ImageCoverage]
    images_total: int
    images_with_results: int


class DentalComparisonResponse(BaseModel):
    matching_result: MatchingResultResponse
    pm_coverage: SubjectCoverage
    am_coverage: SubjectCoverage
    summary: ComparisonSummary
    teeth: list[ToothComparison]


# ── Laporan identifikasi (INTERPOL DVI) ─────────────────────────────

class ReportPerson(BaseModel):
    id: UUID | None = None
    username: str | None = None
    full_name: str | None = None


class ReportSubject(BaseModel):
    id: UUID
    subject_type: Literal["ante_mortem", "post_mortem"]
    full_name: str | None = None
    case_reference: str | None = None
    notes: str | None = None
    created_at: datetime
    created_by: ReportPerson | None = None


class ReportImage(BaseModel):
    """Chain-of-custody satu citra (hash SHA-256 dari saat upload)."""
    dental_image_id: UUID
    subject_id: UUID
    view_type: str
    file_hash: str
    device_id: str | None = None
    captured_at: datetime | None = None
    uploaded_at: datetime
    uploaded_by: ReportPerson | None = None
    teeth_detected: int


class ReportDecision(BaseModel):
    status: MatchingStatus
    decided_by: ReportPerson | None = None
    decided_at: datetime | None = None
    matched_by: ReportPerson | None = None
    matched_at: datetime


class NarrativeReference(BaseModel):
    """Satu rujukan korpus yang dikutip narasi sebagai [n]."""
    n: int | None = None
    source: str | None = None
    page: int | None = None
    section: str | None = None
    score: float | None = None


class ReportNarrative(BaseModel):
    """
    Bagian 4 "Analisis AI" laporan (narasi Agentic RAG).
    - available     : narasi tersimpan (dibuat sekali, dipakai ulang tiap laporan dibuka)
    - pending       : layanan RAG terhubung tetapi narasi belum dibuat → frontend memanggil
                      POST /matching-results/{id}/report/narrative
    - not_available : layanan RAG tidak dikonfigurasi → laporan tetap boleh dicetak
                      dengan catatan "Analisis AI tidak tersedia"
    Kegagalan pembuatan narasi dikembalikan sebagai HTTP 502/504, bukan status di sini.
    """
    status: Literal["available", "pending", "not_available"]
    content: str | None = None
    references: list[NarrativeReference] = Field(default_factory=list)
    engine: str | None = None
    warnings: list[str] = Field(default_factory=list)
    model_version: str | None = None
    generated_at: datetime | None = None
    message: str | None = None


class IdentificationReportResponse(BaseModel):
    report_type: Literal["INTERPOL_DVI_IDENTIFICATION"] = "INTERPOL_DVI_IDENTIFICATION"
    generated_at: datetime
    generated_by: ReportPerson
    matching_result_id: UUID
    case_reference: str | None = None
    pm_subject: ReportSubject
    am_subject: ReportSubject
    scores: dict[str, float | int | None]
    decision: ReportDecision
    comparison: DentalComparisonResponse
    images: list[ReportImage]
    narrative: ReportNarrative
