"""
Dentify Services — AI Service Client
HTTP client untuk komunikasi dengan AI microservice terpisah.

⚠️ Format request/response AI service TERISOLASI di file ini (+ pembacaan `result` di
   api/v1/inference.py dan services/subject_embedding.py).

Kontrak "Dentify AI Engine Service" v1.0.0 (diverifikasi live 16 Nov 2026, skema di {base}/openapi.json):
    POST {base}/api/v1/inference   header X-API-Key
         body {dental_image_id, subject_id, image_url (presigned MinIO), view_type: frontal|left|right}
         → 202 {job_id, status}
    GET  {base}/api/v1/inference/{job_id}/status
         → {job_id, status: pending|processing|completed|failed, dental_image_id, subject_id,
            result | null, error | null, created_at, updated_at}
    result = {scan_id, view_type, image_path, qc_result{blur_score, is_blurry, mean_brightness,
              is_underexposed, is_overexposed, passed_qc}, missing_teeth[fdi],
              subject_embedding[512, L2-normalized, PER CITRA], subject_embedding_model,
              detected_teeth[{fdi_id (str), confidence 0..1, bbox [x, y, w, h] piksel,
                              landmarks {nama: [x, y]}, morphology {fitur: 0|1},
                              embedding[512], conditions[]}]}
    GET  {base}/health (tanpa key) → {status, checkpoint_loaded, device}
"""

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx

from core.config import settings

# dental_images.view_type (DB) → view_type AI service
VIEW_TYPE_TO_AI = {"depan": "frontal", "kiri": "left", "kanan": "right"}


class AIServiceClient:
    """
    Client HTTP async untuk berinteraksi dengan AI inference microservice.
    Mendukung trigger job baru dan polling status job sampai selesai.
    """

    def __init__(self) -> None:
        self.base_url = settings.AI_SERVICE_BASE_URL.rstrip("/")
        self.api_key = settings.AI_SERVICE_API_KEY
        self.timeout = settings.AI_SERVICE_TIMEOUT_SECONDS
        self.poll_interval = settings.AI_SERVICE_POLL_INTERVAL_SECONDS
        self.max_poll_attempts = settings.AI_SERVICE_MAX_POLL_ATTEMPTS

    @property
    def headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    async def trigger_inference(
        self,
        dental_image_id: UUID,
        subject_id: UUID,
        image_url: str,
        view_type: str,
    ) -> dict[str, Any]:
        """
        Kirim request ke AI service untuk memulai inferensi pada sebuah citra dental.
        `view_type` memakai nilai DB (depan/kiri/kanan) — dipetakan di sini.

        Returns:
            dict berisi {"job_id": "<ai_service_job_id>", "status": "processing"}

        Raises:
            ValueError: view_type tidak dikenal
            httpx.HTTPStatusError: jika AI service return non-2xx
            httpx.ConnectError: jika AI service tidak reachable
        """
        if view_type not in VIEW_TYPE_TO_AI:
            raise ValueError(f"view_type tidak dikenal: {view_type!r}")
        request_payload = {
            "dental_image_id": str(dental_image_id),
            "subject_id": str(subject_id),
            "image_url": image_url,
            "view_type": VIEW_TYPE_TO_AI[view_type],
        }

        async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
            response = await client.post(
                f"{self.base_url}/api/v1/inference",
                json=request_payload,
            )
            response.raise_for_status()
            return response.json()

    async def poll_job_status(self, ai_job_id: str) -> dict[str, Any]:
        """
        Polling status job ke AI service (satu kali).

        Returns:
            dict berisi {"job_id": "...", "status": "processing|completed|failed",
                         "result": {...} | null, "error": "..." | null}

        Raises:
            httpx.HTTPStatusError: jika AI service return non-2xx
        """
        async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
            response = await client.get(
                f"{self.base_url}/api/v1/inference/{ai_job_id}/status",
            )
            response.raise_for_status()
            return response.json()

    async def poll_until_complete(self, ai_job_id: str) -> dict[str, Any]:
        """
        Polling berulang ke AI service sampai job selesai (completed/failed)
        atau mencapai batas maksimum polling.

        Returns:
            dict hasil polling terakhir
        """
        for attempt in range(self.max_poll_attempts):
            try:
                result = await self.poll_job_status(ai_job_id)

                status = result.get("status", "").lower()
                if status in ("completed", "failed"):
                    return result

            except (httpx.HTTPStatusError, httpx.ConnectError) as e:
                # Log error tapi lanjut polling (AI service mungkin sementara down)
                print(
                    f"[AI_CLIENT] Poll attempt {attempt + 1}/{self.max_poll_attempts} "
                    f"gagal untuk job {ai_job_id}: {e}"
                )
                # Jika sudah attempt terakhir, raise error
                if attempt == self.max_poll_attempts - 1:
                    return {
                        "job_id": ai_job_id,
                        "status": "failed",
                        "error": f"Polling gagal setelah {self.max_poll_attempts} percobaan: {e}",
                    }

            await asyncio.sleep(self.poll_interval)

        # Batas polling tercapai tanpa status terminal
        return {
            "job_id": ai_job_id,
            "status": "failed",
            "error": f"Timeout: job belum selesai setelah {self.max_poll_attempts} percobaan polling",
        }


# Singleton instance
ai_service_client = AIServiceClient()
