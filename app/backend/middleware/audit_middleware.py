"""
Dentify Middleware — Audit Log Middleware
Middleware otomatis untuk mencatat setiap aktivitas HTTP penting ke audit log forensik
secara non-blocking menggunakan background task.
"""

import asyncio
import uuid
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from core.database import async_session_factory
from core.security import decode_access_token
from services.audit_service import create_audit_entry

# Path yang dikecualikan dari audit log (endpoint sistem & dokumentasi)
EXCLUDED_PATHS = {
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/favicon.ico",
    "/",
}

# Set untuk menyimpan strong reference background tasks agar tidak di-garbage-collect sebelum selesai
_background_tasks: set[asyncio.Task] = set()


async def _async_record_audit(
    action: str,
    resource_type: str,
    method: str,
    endpoint: str,
    status_code: int,
    user_id: uuid.UUID | None,
    resource_id: uuid.UUID | None,
    ip_address: str | None,
    details: dict[str, Any] | None,
) -> None:
    """
    Task background untuk menyimpan entri audit ke database tanpa menambah latency response.
    """
    try:
        async with async_session_factory() as session:
            await create_audit_entry(
                db=session,
                action=action,
                resource_type=resource_type,
                method=method,
                endpoint=endpoint,
                status_code=status_code,
                user_id=user_id,
                resource_id=resource_id,
                ip_address=ip_address,
                details=details,
            )
    except Exception as e:
        print(f"[AUDIT_ERROR] Gagal mencatat audit log untuk {method} {endpoint}: {e}")


class AuditLogMiddleware(BaseHTTPMiddleware):
    """
    FastAPI / Starlette Middleware untuk audit trail otomatis.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Lewati endpoint sistem & dokumentasi
        if path in EXCLUDED_PATHS:
            return await call_next(request)

        # Proses request aplikasi terlebih dahulu
        response = await call_next(request)

        # Ekstrak data audit setelah response selesai dibentuk
        method = request.method
        status_code = response.status_code

        # Ekstrak client IP
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()
        elif request.client:
            client_ip = request.client.host
        else:
            client_ip = None

        # Ekstrak User ID jika terotentikasi via JWT
        user_id: uuid.UUID | None = getattr(request.state, "user_id", None)
        if not user_id:
            auth_header = request.headers.get("authorization")
            if auth_header and auth_header.lower().startswith("bearer "):
                token = auth_header[7:].strip()
                payload = decode_access_token(token)
                if payload and payload.get("sub"):
                    try:
                        user_id = uuid.UUID(payload["sub"])
                    except (ValueError, TypeError):
                        user_id = None

        # Tentukan Action dan Resource Type
        action = getattr(request.state, "audit_action", None)
        resource_type = getattr(request.state, "resource_type", None)
        resource_id = getattr(request.state, "resource_id", None)

        if not action or not resource_type:
            if path == "/api/v1/auth/login":
                action = "LOGIN"
                resource_type = "auth"
            elif path == "/api/v1/auth/me":
                action = "VIEW_PROFILE"
                resource_type = "users"
            elif "/audit" in path:
                action = f"{method}_AUDIT"
                resource_type = "audit"
            else:
                parts = [p for p in path.split("/") if p]
                res = parts[2] if len(parts) > 2 else "system"
                action = f"{method}_{res.upper()}"
                resource_type = res

        # Sanitasi details: JANGAN mencatat raw request body
        details: dict[str, Any] = {}
        if request.query_params:
            details["query_params"] = dict(request.query_params)

        custom_details = getattr(request.state, "audit_details", None)
        if isinstance(custom_details, dict):
            details.update(custom_details)

        final_details = details if details else None

        # Jalankan pencatatan audit di background task (non-blocking) dengan strong reference
        task = asyncio.create_task(
            _async_record_audit(
                action=action,
                resource_type=resource_type,
                method=method,
                endpoint=path,
                status_code=status_code,
                user_id=user_id,
                resource_id=resource_id,
                ip_address=client_ip,
                details=final_details,
            )
        )
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)

        return response

