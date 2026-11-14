"""
Dentify — Mock AI Microservice (KHUSUS DEV, JANGAN DI-DEPLOY)
Meniru kontrak AI service yang saat ini DIASUMSIKAN backend (services/ai_service_client.py),
agar alur inferensi → tooth_records/embedding → matching → perbandingan gigi → laporan
bisa diuji end-to-end selama layanan AI asli (tim Bonifasius) belum tersedia.

Kontrak yang ditiru:
    POST /api/v1/inference            body {dental_image_id, subject_id, image_url}
                                      → 202 {"job_id", "status": "processing"}
    GET  /api/v1/inference/{id}/status → {"job_id", "status", "result", "error"}
    result = {"subject_embedding": [512 float], "detected_teeth": [
                 {"fdi_id", "bbox": {x,y,width,height}, "landmarks": {...},
                  "morphology": {...}, "confidence": 0..1}, ...]}

Perilaku:
- Citra benar-benar diunduh dari presigned URL (menguji jalur MinIO → AI). Gagal unduh → job failed.
- Hasil deterministik per subjek (seed dari subject_id): embedding 512-dim ternormalisasi,
  gigi yang terlihat per sudut (depan/kiri/kanan), dan fitur morfologi per gigi.
  bbox disusun melengkung di atas dimensi citra asli (dibaca dari header PNG/JPEG).
- MOCK_AI_DELAY_SECONDS (default 3)  : lama job "processing"
- MOCK_AI_FAIL_RATE (default 0)      : peluang job gagal (uji jalur failed), 0..1
- Header X-API-Key tidak divalidasi (dev).

Jalankan dari app/backend/ (terminal terpisah dari backend):
    venv/Scripts/python.exe scripts/mock_ai_service.py          # http://127.0.0.1:8100
Backend memakai AI_SERVICE_BASE_URL default http://localhost:8100.
"""

import asyncio
import hashlib
import math
import os
import random
import struct
import uuid
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

DELAY = float(os.environ.get("MOCK_AI_DELAY_SECONDS", "3"))
FAIL_RATE = float(os.environ.get("MOCK_AI_FAIL_RATE", "0"))
PORT = int(os.environ.get("MOCK_AI_PORT", "8100"))
EMBEDDING_DIM = 512
MODEL_VERSION = "mock_ai_v1"

# Gigi yang "terlihat" per sudut foto intraoral (notasi FDI)
VISIBLE_TEETH = {
    "depan": [13, 12, 11, 21, 22, 23, 43, 42, 41, 31, 32, 33],
    "kiri": [23, 24, 25, 26, 27, 33, 34, 35, 36, 37],
    "kanan": [13, 14, 15, 16, 17, 43, 44, 45, 46, 47],
}
VIEW_BY_HINT = {"depan": "depan", "kiri": "kiri", "kanan": "kanan"}

app = FastAPI(title="Dentify MOCK AI Service (dev only)")
jobs: dict[str, dict[str, Any]] = {}


class InferenceRequest(BaseModel):
    dental_image_id: str
    subject_id: str
    image_url: str


def _rng(*parts: Any) -> random.Random:
    seed = hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()
    return random.Random(int(seed[:16], 16))


def _image_size(data: bytes) -> tuple[int, int]:
    """Lebar/tinggi dari header PNG atau JPEG; fallback 1200×800."""
    try:
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", data[16:24])
            return w, h
        if data[:2] == b"\xff\xd8":
            i = 2
            while i < len(data) - 9:
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2):
                    h, w = struct.unpack(">HH", data[i + 5:i + 9])
                    return w, h
                i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    except Exception:
        pass
    return 1200, 800


def _embedding(subject_id: str) -> list[float]:
    r = _rng("embedding", subject_id)
    v = [r.gauss(0, 1) for _ in range(EMBEDDING_DIM)]
    norm = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / norm for x in v]


def _morphology(subject_id: str, fdi: int) -> dict[str, Any]:
    r = _rng("morph", subject_id, fdi)
    return {
        "rotasi_derajat": round(r.uniform(0, 20), 1),
        "diastema": int(r.random() < 0.15),
        "tambalan": int(r.random() < 0.2),
        "karies": int(r.random() < 0.1),
    }


def _teeth(subject_id: str, view: str, width: int, height: int) -> list[dict[str, Any]]:
    r = _rng("teeth", subject_id, view)
    fdis = [f for f in VISIBLE_TEETH[view] if r.random() > 0.08]  # sesekali gigi tak terdeteksi
    upper = [f for f in fdis if f < 30]
    lower = [f for f in fdis if f >= 30]
    out = []
    for row, row_teeth in ((0, upper), (1, lower)):
        n = max(len(row_teeth), 1)
        tw = width * 0.8 / n
        th = height * 0.28
        for i, fdi in enumerate(row_teeth):
            # lengkung: gigi di tengah sedikit lebih jauh dari garis oklusal
            curve = math.sin(math.pi * (i + 0.5) / n) * height * 0.06
            x = width * 0.1 + i * tw
            y = height * 0.18 + curve if row == 0 else height * 0.52 - curve
            out.append(
                {
                    "fdi_id": str(fdi),
                    "bbox": {"x": round(x, 1), "y": round(y, 1), "width": round(tw * 0.9, 1), "height": round(th, 1)},
                    "landmarks": {
                        "cusp": [round(x + tw * 0.45, 1), round(y + (th if row == 0 else 0), 1)],
                        "cej_m": [round(x + tw * 0.1, 1), round(y + th * 0.5, 1)],
                        "cej_d": [round(x + tw * 0.8, 1), round(y + th * 0.5, 1)],
                    },
                    "morphology": _morphology(subject_id, fdi),
                    "confidence": round(r.uniform(0.78, 0.99), 3),
                }
            )
    return out


async def _process(job_id: str, req: InferenceRequest) -> None:
    job = jobs[job_id]
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(req.image_url)
            resp.raise_for_status()
            data = resp.content
        await asyncio.sleep(DELAY)
        if random.random() < FAIL_RATE:
            raise RuntimeError("MOCK: kegagalan acak (MOCK_AI_FAIL_RATE)")
        width, height = _image_size(data)
        # sudut foto tidak dikirim backend → tebak dari object key (subjects/<id>/<view>_...) bila ada
        view = next((v for k, v in VIEW_BY_HINT.items() if f"/{k}" in req.image_url), None)
        view = view or _rng("view", req.dental_image_id).choice(list(VISIBLE_TEETH))
        job["status"] = "completed"
        job["result"] = {
            "model_version": MODEL_VERSION,
            "image_size": {"width": width, "height": height},
            "subject_embedding": _embedding(req.subject_id),
            "detected_teeth": _teeth(req.subject_id, view, width, height),
        }
        print(f"[MOCK_AI] job {job_id} completed: {len(job['result']['detected_teeth'])} gigi, sudut {view}, {width}x{height}")
    except Exception as e:
        job["status"] = "failed"
        job["error"] = f"MOCK AI gagal memproses citra: {e}"
        print(f"[MOCK_AI] job {job_id} failed: {e}")


@app.post("/api/v1/inference", status_code=202)
async def create_job(req: InferenceRequest):
    job_id = f"mock-{uuid.uuid4()}"
    jobs[job_id] = {"job_id": job_id, "status": "processing", "result": None, "error": None}
    asyncio.create_task(_process(job_id, req))
    return {"job_id": job_id, "status": "processing"}


@app.get("/api/v1/inference/{job_id}/status")
async def job_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="job tidak ditemukan")
    return jobs[job_id]


@app.get("/health")
async def health():
    return {"status": "ok", "service": "mock-ai", "jobs": len(jobs)}


if __name__ == "__main__":
    print(f"[MOCK_AI] DEV ONLY — delay {DELAY}s, fail rate {FAIL_RATE}, port {PORT}")
    uvicorn.run(app, host="127.0.0.1", port=PORT)
