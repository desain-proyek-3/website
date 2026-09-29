"""
Dentify Services — AI Service Client
HTTP client untuk komunikasi dengan AI microservice terpisah.

⚠️ SEMUA asumsi format request/response AI service TERISOLASI di file ini.
   Kontrak HTTP AI service BELUM final dikonfirmasi ulang ke Bonifasius (lihat be-handover.md 5.6.1).
   Jika format berubah, HANYA file ini yang perlu dimodifikasi — tidak menyentuh model/schema/router.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx

from core.config import settings


class AIServiceClient:
    """
    Client HTTP async untuk berinteraksi dengan AI inference microservice.
    Mendukung trigger job baru dan polling status job sampai selesai.
    """

    def __init__(self) -> None:
        self.base_url = settings.AI_SERVICE_BASE_URL
        self.timeout = settings.AI_SERVICE_TIMEOUT_SECONDS
        self.poll_interval = settings.AI_SERVICE_POLL_INTERVAL_SECONDS
        self.max_poll_attempts = settings.AI_SERVICE_MAX_POLL_ATTEMPTS

    async def trigger_inference(
        self,
        dental_image_id: UUID,
        subject_id: UUID,
        image_file_path: str,
    ) -> dict[str, Any]:
        """
        Kirim request ke AI service untuk memulai inferensi pada sebuah citra dental.

        Returns:
            dict berisi minimal {"job_id": "<ai_service_job_id>", "status": "processing"}

        Raises:
            httpx.HTTPStatusError: jika AI service return non-2xx
            httpx.ConnectError: jika AI service tidak reachable

        TODO: Format request ini ASUMSI — belum dikonfirmasi final ke Bonifasius.
              Field yang dikirim mungkin perlu disesuaikan dengan kontrak DentalScanOutput.
              Kemungkinan perlu kirim file binary langsung, bukan hanya path.
        """
        # TODO: Payload ini masih asumsi. Sesuaikan setelah konfirmasi kontrak dengan tim AI.
        request_payload = {
            "dental_image_id": str(dental_image_id),
            "subject_id": str(subject_id),
            "image_path": image_file_path,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            # TODO: Endpoint path "/api/v1/inference" masih asumsi.
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
            dict berisi minimal {"job_id": "...", "status": "processing|completed|failed",
                                  "result": {...} | null, "error": "..." | null}

        Raises:
            httpx.HTTPStatusError: jika AI service return non-2xx

        TODO: Format response ini ASUMSI — belum dikonfirmasi final ke Bonifasius.
              Field "result" mungkin berisi DentalScanOutput (bounding boxes, FDI numbers,
              landmarks, embeddings) — format persisnya belum divalidasi.
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            # TODO: Endpoint path "/api/v1/inference/{job_id}/status" masih asumsi.
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

        TODO: Status string ("completed", "failed", "processing") masih asumsi.
              Sesuaikan dengan kontrak AI service yang sudah dikonfirmasi.
        """
        for attempt in range(self.max_poll_attempts):
            try:
                result = await self.poll_job_status(ai_job_id)

                # TODO: Nama field "status" dan nilainya masih asumsi
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
