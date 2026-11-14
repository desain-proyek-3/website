"""
Dentify Services — Agentic RAG Client (narasi laporan INTERPOL DVI)
HTTP client ke layanan Agentic RAG (Qwen3, 4 agen: Planner–Retrieval–Reasoning–Validator)
milik tim AI, untuk menyintesis narasi temuan odontologi forensik pada laporan identifikasi.

⚠️ Kontrak HTTP layanan RAG BELUM ada (menunggu tim AI, target Pekan 13). Seluruh asumsi
   format request/response TERISOLASI di file ini — router & skema laporan tidak perlu
   diubah saat kontrak final, cukup sesuaikan `generate_narrative()`.

Asumsi sementara:
    POST {RAG_SERVICE_BASE_URL}/api/v1/reports
    header X-API-Key (bila diset)
    body  {"matching_result_id", "pm_subject", "am_subject", "scores", "comparison"}
    200 → {"content": str, "references": [{...}], "model_version": str}

Selama RAG_SERVICE_BASE_URL kosong, tidak ada request jaringan — narasi berstatus
"not_available" dan laporan tetap dibuat dari data terstruktur.
"""

import logging
from typing import Any

import httpx

from core.config import settings
from schemas.dental_comparison import ReportNarrative

logger = logging.getLogger("dentify.rag")


class RAGServiceClient:
    def __init__(self) -> None:
        self.base_url = settings.RAG_SERVICE_BASE_URL.rstrip("/")
        self.api_key = settings.RAG_SERVICE_API_KEY
        self.timeout = settings.RAG_SERVICE_TIMEOUT_SECONDS

    @property
    def configured(self) -> bool:
        return bool(self.base_url)

    async def generate_narrative(self, findings: dict[str, Any]) -> ReportNarrative:
        """Minta narasi laporan ke layanan RAG. Tidak pernah raise — kegagalan jadi status 'failed'."""
        if not self.configured:
            return ReportNarrative(
                status="not_available",
                message="Layanan Agentic RAG belum terhubung — narasi temuan belum tersedia.",
            )

        headers = {"X-API-Key": self.api_key} if self.api_key else {}
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=headers) as client:
                response = await client.post(f"{self.base_url}/api/v1/reports", json=findings)
                response.raise_for_status()
                body = response.json()
        except (httpx.HTTPError, ValueError) as e:
            logger.error("[RAG] Gagal membuat narasi laporan: %s", e)
            return ReportNarrative(status="failed", message=f"Layanan Agentic RAG gagal: {e}")

        content = body.get("content")
        if not isinstance(content, str) or not content.strip():
            return ReportNarrative(status="failed", message="Layanan Agentic RAG tidak mengembalikan narasi.")
        references = body.get("references")
        return ReportNarrative(
            status="available",
            content=content,
            references=references if isinstance(references, list) else [],
            model_version=body.get("model_version"),
        )


# Singleton instance
rag_service_client = RAGServiceClient()
