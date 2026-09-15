"""
Dentify API v1 — Main Router
Menggabungkan semua router modular API v1 ke dalam satu APIRouter.
"""

from fastapi import APIRouter

from api.v1.auth import router as auth_router
from api.v1.audit import router as audit_router

api_router = APIRouter()

# Register modular sub-routers
api_router.include_router(auth_router)
api_router.include_router(audit_router)

