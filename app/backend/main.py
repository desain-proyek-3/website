"""
Dentify Backend — FastAPI Entry Point
Jalankan: uvicorn main:app --reload
(dari dalam folder app/backend/)
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from api.v1.router import api_router as api_v1_router
from core.config import settings
from core.database import check_db_connection
from middleware.audit_middleware import AuditLogMiddleware

# Import semua models agar terdaftar di Base.metadata
import models  # noqa: F401




# ── Lifespan ────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: verifikasi koneksi DB saat server mulai.
    Shutdown: cleanup jika diperlukan.
    """
    # Startup
    try:
        await check_db_connection()
        print("[OK] Database connection established successfully.")
    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")
        # Tetap jalankan server agar health-check bisa report status

    try:
        from services.storage_service import storage_service
        if storage_service.ensure_bucket_exists():
            print("[OK] MinIO storage service and bucket ready.")
        else:
            print("[WARN] MinIO bucket initialization returned False.")
    except Exception as e:
        print(f"[WARN] MinIO initialization error: {e}")

    yield
    # Shutdown
    print("[INFO] Shutting down Dentify API.")


# ── App Instance ────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Backend API untuk Dentify — Sistem Disaster Victim Identification (DVI) "
        "forensik gigi berbasis AI. Mengelola data ante-mortem / post-mortem, "
        "citra intraoral, embedding biometrik, dan hasil pencocokan."
    ),
    lifespan=lifespan,
)

# ── Middleware ──────────────────────────────────────────────────────
app.add_middleware(AuditLogMiddleware)



# ── Health Check Endpoint ───────────────────────────────────────────
@app.get(
    "/health",
    tags=["System"],
    summary="Health Check",
    description="Cek status API server dan koneksi ke PostgreSQL.",
)
async def health_check():
    """
    Endpoint health-check sederhana.
    Return status koneksi database dan informasi server.
    """
    db_status = "unknown"
    db_error = None

    try:
        await check_db_connection()
        db_status = "connected"
    except Exception as e:
        db_status = "disconnected"
        db_error = str(e)

    response = {
        "status": "healthy" if db_status == "connected" else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "database": {
            "status": db_status,
            "host": settings.POSTGRES_HOST,
            "port": settings.POSTGRES_PORT,
            "database": settings.POSTGRES_DB,
        },
    }

    if db_error:
        response["database"]["error"] = db_error

    status_code = 200 if db_status == "connected" else 503
    return JSONResponse(content=response, status_code=status_code)


# ── Root Endpoint ───────────────────────────────────────────────────
@app.get(
    "/",
    tags=["System"],
    summary="Root",
)
async def root():
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }


# ── API Routers ─────────────────────────────────────────────────────
app.include_router(api_v1_router, prefix="/api/v1")

