"""
Dentify — Receiver lokal untuk uji upload dari alat ESP32-S3 (tanpa DB/MinIO).

Meniru kontrak endpoint yang akan dibuat di backend:
    POST /api/v1/device/captures
    Header : X-Device-Key: <key>
    Body   : multipart/form-data
             file        (image/jpeg, wajib)
             device_id   (wajib)
             sha256      (hex 64 char, wajib — dicocokkan dengan isi file)
             captured_at (ISO 8601, opsional)
             view_type   ('depan' | 'kiri' | 'kanan', opsional)
    Balasan: 201 {"capture_id", "sha256", "size", ...}

File yang diterima disimpan ke folder DEVICE_RECEIVER_OUT (default: scripts/_device_inbox/)
beserta file .json metadata.

Jalankan (dari app/backend):
    venv\\Scripts\\python scripts\\device_receiver.py
Env opsional: DEVICE_KEY (default 'dev-device-key'), DEVICE_RECEIVER_PORT (default 8090).
JANGAN di-deploy — hanya untuk development.
"""

import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

DEVICE_KEY = os.getenv("DEVICE_KEY", "dev-device-key")
PORT = int(os.getenv("DEVICE_RECEIVER_PORT", "8090"))
OUT_DIR = Path(os.getenv("DEVICE_RECEIVER_OUT", Path(__file__).parent / "_device_inbox"))
MAX_BYTES = 20 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/jpg", "application/octet-stream"}
VIEW_TYPES = {"depan", "kiri", "kanan"}

app = FastAPI(title="Dentify Device Receiver (dev)")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "device-receiver"}


@app.post("/api/v1/device/captures", status_code=201)
async def receive_capture(
    file: UploadFile = File(...),
    device_id: str = Form(...),
    sha256: str = Form(...),
    captured_at: str | None = Form(None),
    view_type: str | None = Form(None),
    x_device_key: str | None = Header(None),
) -> dict:
    if x_device_key != DEVICE_KEY:
        raise HTTPException(401, "X-Device-Key tidak valid")

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Content-Type '{content_type}' tidak didukung (harus image/jpeg)")

    if view_type is not None and view_type not in VIEW_TYPES:
        raise HTTPException(400, f"view_type '{view_type}' tidak valid")

    data = await file.read()
    if not data:
        raise HTTPException(400, "File kosong")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File melebihi 20 MB")
    if data[:3] != b"\xff\xd8\xff":
        raise HTTPException(400, "Isi file bukan JPEG (magic bytes tidak cocok)")

    actual_hash = hashlib.sha256(data).hexdigest()
    if actual_hash != sha256.strip().lower():
        raise HTTPException(
            422,
            f"SHA-256 tidak cocok: alat={sha256.strip().lower()} server={actual_hash} "
            "(file rusak/terpotong saat transfer)",
        )

    capture_id = uuid.uuid4()
    received_at = datetime.now(timezone.utc)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stem = f"{received_at:%Y%m%d_%H%M%S}_{device_id}_{capture_id.hex[:8]}"
    (OUT_DIR / f"{stem}.jpg").write_bytes(data)

    meta = {
        "capture_id": str(capture_id),
        "device_id": device_id,
        "original_filename": file.filename,
        "size": len(data),
        "sha256": actual_hash,
        "captured_at": captured_at,
        "view_type": view_type,
        "received_at": received_at.isoformat(),
    }
    (OUT_DIR / f"{stem}.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"[device-receiver] OK {device_id} {file.filename} {len(data)} B -> {stem}.jpg")
    return meta


if __name__ == "__main__":
    # 0.0.0.0 agar bisa diakses dari perangkat lain di jaringan (ESP32), bukan hanya localhost
    uvicorn.run(app, host="0.0.0.0", port=PORT)
