"""
Helper bersama untuk test live-server Pekan 12+ (test_comparison_report, test_inference_batch).
Server FastAPI harus jalan di 127.0.0.1:8000 dengan DB/MinIO Docker lokal.
"""

import asyncio
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib
from pathlib import Path
from uuid import uuid4

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import models  # noqa: E402,F401 — registrasi seluruh relasi ORM
from core.database import async_session_factory, engine  # noqa: E402

BASE_URL = os.environ.get("DENTIFY_TEST_BASE_URL", "http://127.0.0.1:8000")
MOCK_AI_URL = os.environ.get("DENTIFY_TEST_MOCK_AI_URL", "http://127.0.0.1:8100")


def make_request(path, method="GET", data=None, content_type="application/json", token=None, base=BASE_URL):
    headers = {}
    if data is not None and content_type:
        headers["Content-Type"] = content_type
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if isinstance(data, (dict, list)) else data
    req = urllib.request.Request(f"{base}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"error": raw}


def service_up(base: str) -> bool:
    try:
        with urllib.request.urlopen(f"{base}/health", timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False


def png_bytes(width: int = 160, height: int = 100) -> bytes:
    """PNG valid kecil (abu-abu polos) — header IHDR dibaca mock AI untuk dimensi."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + b"\x80" * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def build_multipart(fields: dict, files: dict) -> tuple[bytes, str]:
    boundary = f"----DentifyTest{uuid4().hex}"
    body = bytearray()
    for name, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    for name, (filename, content, ctype) in files.items():
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
            f"Content-Type: {ctype}\r\n\r\n"
        ).encode()
        body += content + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def login(username: str, password: str) -> str:
    status, res = make_request("/api/v1/auth/login", method="POST", data={"username": username, "password": password})
    assert status == 200, f"Login {username} gagal: {res}"
    return res["access_token"]


def create_user(admin_token: str, role: str, prefix: str) -> tuple[dict, str]:
    suffix = uuid4().hex[:6]
    password = f"{role}-123456"
    status, res = make_request(
        "/api/v1/users",
        method="POST",
        data={
            "username": f"{prefix}_{role}_{suffix}",
            "email": f"{prefix}.{role}.{suffix}@dentify.test",
            "full_name": f"{prefix} {role}",
            "role": role,
            "password": password,
        },
        token=admin_token,
    )
    assert status == 201, f"Pembuatan {role} gagal: {res}"
    return res, login(res["username"], password)


def deactivate_user(admin_token: str, user: dict) -> None:
    make_request(
        f"/api/v1/users/{user['id']}",
        method="PUT",
        data={"email": user["email"], "full_name": user["full_name"], "role": user["role"], "is_active": False},
        token=admin_token,
    )


def create_subject(token: str, subject_type: str, name: str, case_reference: str | None = None) -> str:
    status, res = make_request(
        "/api/v1/subjects",
        method="POST",
        data={"subject_type": subject_type, "full_name": name, "case_reference": case_reference, "notes": None},
        token=token,
    )
    assert status == 201, f"Pembuatan subjek gagal: {res}"
    return res["id"]


def upload_image(token: str, subject_id: str, view_type: str) -> dict:
    body, ctype = build_multipart(
        {"subject_id": subject_id, "view_type": view_type},
        {"file": (f"{view_type}.png", png_bytes(), "image/png")},
    )
    status, res = make_request("/api/v1/dental-images/upload", method="POST", data=body, content_type=ctype, token=token)
    assert status == 201, f"Upload citra gagal: {res}"
    return res


def run_db(operation):
    """Jalankan operasi async terhadap DB dalam satu transaksi (event loop terpisah)."""
    async def runner():
        try:
            async with async_session_factory() as session:
                result = await operation(session)
                await session.commit()
                return result
        finally:
            await engine.dispose()
    return asyncio.run(runner())


def wait_until(predicate, timeout: float = 30.0, interval: float = 0.3):
    """Ulangi predicate() sampai mengembalikan nilai truthy; kembalikan nilai itu (None bila timeout)."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(interval)
    return None
