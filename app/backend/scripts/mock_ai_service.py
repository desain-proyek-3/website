"""
Dentify — Mock AI Microservice (KHUSUS DEV, JANGAN DI-DEPLOY)
Meniru kontrak AI service asli "Dentify AI Engine Service" v1.0.0 (diverifikasi live
16 Nov 2026 — ringkasan di services/ai_service_client.py), agar alur inferensi →
tooth_records/embedding → matching → perbandingan gigi → laporan bisa diuji di laptop
(AI asli tidak bisa mengunduh dari MinIO Docker lokal).

Kontrak yang ditiru:
    POST /api/v1/inference            body {dental_image_id, subject_id, image_url, view_type}
                                      → 202 {"job_id", "status": "processing"}
    GET  /api/v1/inference/{id}/status → {"job_id", "status", "dental_image_id", "subject_id",
                                          "result", "error", "created_at", "updated_at"}
    result = {scan_id, view_type, image_path, qc_result{...}, missing_teeth[],
              subject_embedding[512] (PER CITRA), subject_embedding_model,
              detected_teeth[{fdi_id, confidence, bbox [x,y,w,h], landmarks{6 titik},
                              morphology{7 flag 0/1}, embedding[512], conditions[]}]}

Perilaku:
- Citra benar-benar diunduh dari presigned URL (menguji jalur MinIO → AI). Gagal unduh → job failed.
- Hasil deterministik per subjek (seed dari subject_id): subject_embedding per citra = vektor
  dasar subjek + sedikit derau per sudut (cosine antar sudut ~0.97, seperti AI asli),
  gigi yang terlihat per sudut (frontal/left/right), dan flag morfologi per gigi.
  bbox [x, y, w, h] piksel disusun melengkung di atas dimensi citra asli (header PNG/JPEG).
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
from datetime import datetime, timezone
from typing import Any, Literal

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

DELAY = float(os.environ.get("MOCK_AI_DELAY_SECONDS", "3"))
FAIL_RATE = float(os.environ.get("MOCK_AI_FAIL_RATE", "0"))
PORT = int(os.environ.get("MOCK_AI_PORT", "8100"))
EMBEDDING_DIM = 512
MODEL_VERSION = "mock-resnet-d512"

# Gigi yang "terlihat" per sudut foto intraoral (notasi FDI)
VISIBLE_TEETH = {
    "frontal": [13, 12, 11, 21, 22, 23, 43, 42, 41, 31, 32, 33],
    "left": [23, 24, 25, 26, 27, 33, 34, 35, 36, 37],
    "right": [13, 14, 15, 16, 17, 43, 44, 45, 46, 47],
}
MORPHOLOGY_FLAGS = ("diastema", "rotation", "restoration", "missing", "crowding", "anomaly", "caries")
LANDMARKS = ("cusp_tip", "cej_mesial", "cej_distal", "root_apex", "contact_mesial", "contact_distal")

app = FastAPI(title="Dentify MOCK AI Service (dev only)")
jobs: dict[str, dict[str, Any]] = {}


class InferenceRequest(BaseModel):
    dental_image_id: str
    subject_id: str
    image_url: str
    view_type: Literal["frontal", "left", "right"] = "frontal"


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


def _normalize(v: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in v)) or 1.0
    return [round(x / norm, 6) for x in v]


def _embedding(*seed: Any, base: list[float] | None = None, noise: float = 0.0) -> list[float]:
    """Vektor acak deterministik; dengan `base` = base + derau (embedding per sudut)."""
    r = _rng("embedding", *seed)
    if base is None:
        return _normalize([r.gauss(0, 1) for _ in range(EMBEDDING_DIM)])
    return _normalize([b + r.gauss(0, noise) for b in base])


def _subject_embedding(subject_id: str, view: str) -> list[float]:
    # derau 0.01/dim pada vektor satuan 512-dim -> cosine ~0.97 antar sudut subjek yang sama
    return _embedding(subject_id, view, base=_embedding(subject_id), noise=0.01)


def _morphology(subject_id: str, fdi: int) -> dict[str, int]:
    r = _rng("morph", subject_id, fdi)
    rates = {"diastema": 0.1, "rotation": 0.15, "restoration": 0.2, "caries": 0.1, "crowding": 0.05, "anomaly": 0.02}
    return {k: int(r.random() < rates.get(k, 0)) for k in MORPHOLOGY_FLAGS}


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
            w = tw * 0.9
            out.append(
                {
                    "fdi_id": str(fdi),
                    "confidence": round(r.uniform(0.78, 0.99), 4),
                    "bbox": [round(x), round(y), round(w), round(th)],
                    "landmarks": {
                        name: [round(x + w * r.uniform(0.2, 0.8), 2), round(y + th * r.uniform(0.2, 0.8), 2)]
                        for name in LANDMARKS
                    },
                    "morphology": _morphology(subject_id, fdi),
                    "embedding": _embedding(subject_id, "tooth", fdi),
                    "conditions": [],
                }
            )
    return out


async def _process(job_id: str, req: InferenceRequest) -> None:
    job = jobs[job_id]
    view = req.view_type
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(req.image_url)
            resp.raise_for_status()
            data = resp.content
        await asyncio.sleep(DELAY)
        if random.random() < FAIL_RATE:
            raise RuntimeError("MOCK: kegagalan acak (MOCK_AI_FAIL_RATE)")
        width, height = _image_size(data)
        teeth = _teeth(req.subject_id, view, width, height)
        detected = {int(t["fdi_id"]) for t in teeth}
        job["result"] = {
            "scan_id": job_id,
            "view_type": view,
            "image_path": req.image_url,
            "qc_result": {
                "blur_score": 120.0, "is_blurry": False, "mean_brightness": 140.0,
                "is_underexposed": False, "is_overexposed": False, "passed_qc": True,
            },
            "detected_teeth": teeth,
            "missing_teeth": [str(f) for f in VISIBLE_TEETH[view] if f not in detected],
            "subject_embedding": _subject_embedding(req.subject_id, view),
            "subject_embedding_model": MODEL_VERSION,
        }
        job["status"] = "completed"
        print(f"[MOCK_AI] job {job_id} completed: {len(job['result']['detected_teeth'])} gigi, sudut {view}, {width}x{height}")
    except Exception as e:
        job["status"] = "failed"
        job["error"] = f"MOCK AI gagal memproses citra: {e}"
    finally:
        job["updated_at"] = _now()
        print(f"[MOCK_AI] job {job_id} failed: {e}")


@app.post("/api/v1/inference", status_code=202)
async def create_job(req: InferenceRequest):
    job_id = f"mock-{uuid.uuid4()}"
    now = _now()
    jobs[job_id] = {
        "job_id": job_id, "status": "processing", "dental_image_id": req.dental_image_id,
        "subject_id": req.subject_id, "result": None, "error": None, "created_at": now, "updated_at": now,
    }
    asyncio.create_task(_process(job_id, req))
    return {"job_id": job_id, "status": "processing"}


@app.get("/api/v1/inference/{job_id}/status")
async def job_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="job tidak ditemukan")
    return jobs[job_id]


@app.get("/health")
async def health():
    return {"status": "ok", "checkpoint_loaded": True, "device": "mock", "jobs": len(jobs)}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    print(f"[MOCK_AI] DEV ONLY — delay {DELAY}s, fail rate {FAIL_RATE}, port {PORT}")
    uvicorn.run(app, host="127.0.0.1", port=PORT)
