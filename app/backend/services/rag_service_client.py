"""
Dentify Services — Agentic RAG Client (Bagian 4 "Analisis AI" laporan INTERPOL DVI)
HTTP client ke layanan Agentic RAG milik tim AI (satu service dengan AI inferensi,
`RAG_SERVICE_BASE_URL`), untuk menyintesis narasi temuan odontologi forensik.

Kontrak (OpenAPI layanan + contoh dari tim AI, 25 Nov 2026):
    POST {RAG_SERVICE_BASE_URL}/api/v1/reports
    header X-API-Key, Content-Type: application/json
    body  {"matching_result_id": str,
           "pm_subject"/"am_subject": {"subject_type", "full_name", "case_reference"},
           "scores": {"cosine_similarity", "confidence_score" (0–1), "rank",
                      "superimposition_score", "morphology_diff_score"},
           "comparison": {"summary": {consistent, discrepant, pm_only, am_only,
                                      features_compared, features_different},
                          "teeth": [{"fdi_number", "status", "pm": {"views": [...]} | null,
                                     "am": {...} | null,
                                     "features": [{"feature", "pm", "am", "status"}]}]}}
    200 → {"content": str (dengan penanda [n]),
           "references": [{"n", "source", "page", "section", "score"}],
           "engine": "llm", "warnings": [str], "model_version": str}

Privasi: payload sengaja minimal — catatan bebas subjek, ID internal, dan identitas staf
(created_by, reviewer) TIDAK dikirim ke layanan lain karena tidak dibutuhkan narasi.

Selama RAG_SERVICE_BASE_URL kosong `configured` = False dan tidak ada request jaringan.
"""

import logging
from typing import Any

import httpx

from core.config import settings
from schemas.dental_comparison import ComparisonSummary, ToothComparison
from services.ai_service_client import VIEW_TYPE_TO_AI

logger = logging.getLogger("dentify.rag")

# Narasi hanya dianggap sah bila disusun LLM (engine lain = fallback tanpa analisis).
ACCEPTED_ENGINE = "llm"


class RAGServiceError(Exception):
    """Pembuatan narasi gagal. `message` aman ditampilkan ke pengguna (tanpa URL/kunci)."""

    def __init__(self, message: str, *, timeout: bool = False) -> None:
        super().__init__(message)
        self.message = message
        self.timeout = timeout


def _subject(s: Any) -> dict[str, Any]:
    return {"subject_type": s.subject_type, "full_name": s.full_name, "case_reference": s.case_reference}


def _side(side: Any) -> dict[str, Any] | None:
    if side is None:
        return None
    return {"views": [VIEW_TYPE_TO_AI.get(v, v) for v in side.views]}


def build_report_payload(
    matching_result_id: str,
    pm_subject: Any,
    am_subject: Any,
    scores: dict[str, Any],
    summary: ComparisonSummary,
    teeth: list[ToothComparison],
) -> dict[str, Any]:
    """Susun body POST /api/v1/reports dari data laporan (hanya field yang dibutuhkan narasi)."""
    confidence = scores.get("confidence_score")
    return {
        "matching_result_id": matching_result_id,
        "pm_subject": _subject(pm_subject),
        "am_subject": _subject(am_subject),
        "scores": {
            "cosine_similarity": scores.get("cosine_similarity"),
            # Backend menyimpan confidence dalam persen (0–100); kontrak RAG memakai 0–1.
            "confidence_score": round(confidence / 100, 4) if confidence is not None else None,
            "rank": scores.get("rank"),
            "superimposition_score": scores.get("superimposition_score"),
            "morphology_diff_score": scores.get("morphology_diff_score"),
        },
        "comparison": {
            "summary": summary.model_dump(mode="json"),
            "teeth": [
                {
                    "fdi_number": t.fdi_number,
                    "status": t.status,
                    "pm": _side(t.pm),
                    "am": _side(t.am),
                    "features": [
                        {"feature": f.feature, "pm": f.pm, "am": f.am, "status": f.status} for f in t.features
                    ],
                }
                for t in teeth
            ],
        },
    }


def _clean_references(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    keys = ("n", "source", "page", "section", "score")
    return [{k: ref.get(k) for k in keys} for ref in raw if isinstance(ref, dict)]


class RAGServiceClient:
    def __init__(self) -> None:
        self.base_url = settings.RAG_SERVICE_BASE_URL.rstrip("/")
        self.api_key = settings.RAG_SERVICE_API_KEY
        self.timeout = settings.RAG_SERVICE_TIMEOUT_SECONDS

    @property
    def configured(self) -> bool:
        return bool(self.base_url)

    async def generate_narrative(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Minta narasi ke layanan RAG. Mengembalikan dict siap simpan
        {content, references, engine, warnings, model_version}; gagal → RAGServiceError.
        """
        if not self.configured:
            raise RAGServiceError("Layanan analisis AI belum dikonfigurasi.")

        headers = {"X-API-Key": self.api_key} if self.api_key else {}
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=headers) as client:
                response = await client.post(f"{self.base_url}/api/v1/reports", json=payload)
        except httpx.TimeoutException as e:
            logger.error("[RAG] Timeout setelah %ss: %r", self.timeout, e)
            raise RAGServiceError(
                f"Layanan analisis AI tidak merespons dalam {int(self.timeout)} detik.", timeout=True
            ) from e
        except httpx.HTTPError as e:
            logger.error("[RAG] Gagal menghubungi layanan: %r", e)
            raise RAGServiceError("Layanan analisis AI tidak dapat dihubungi.") from e

        if response.status_code != 200:
            logger.error("[RAG] HTTP %s: %s", response.status_code, response.text[:500])
            raise RAGServiceError(f"Layanan analisis AI menolak permintaan (HTTP {response.status_code}).")
        try:
            body = response.json()
        except ValueError as e:
            raise RAGServiceError("Respons layanan analisis AI tidak valid.") from e
        if not isinstance(body, dict):
            raise RAGServiceError("Respons layanan analisis AI tidak valid.")

        content = body.get("content")
        if not isinstance(content, str) or not content.strip():
            raise RAGServiceError("Layanan analisis AI tidak mengembalikan narasi.")
        engine = body.get("engine")
        if engine != ACCEPTED_ENGINE:
            logger.warning("[RAG] Narasi ditolak, engine=%r (bukan %r)", engine, ACCEPTED_ENGINE)
            raise RAGServiceError(
                f"Layanan analisis AI tidak menyusun narasi dengan model bahasa (engine: {engine or '-'})."
            )

        warnings = body.get("warnings")
        model_version = body.get("model_version")
        return {
            "content": content.strip(),
            "references": _clean_references(body.get("references")),
            "engine": engine,
            "warnings": [str(w) for w in warnings] if isinstance(warnings, list) else [],
            "model_version": model_version if isinstance(model_version, str) else None,
        }


# Singleton instance
rag_service_client = RAGServiceClient()
