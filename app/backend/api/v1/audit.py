"""
Dentify API v1 — Audit Log Endpoints
Endpoint pengawasan forensik: membaca daftar audit logs dan memverifikasi integritas hash-chain.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import require_role
from models.audit_log import AuditLog
from models.user import User
from schemas.audit import AuditLogListResponse, AuditLogResponse, AuditVerifyResponse
from services.audit_service import verify_chain_integrity

router = APIRouter(prefix="/audit", tags=["Audit Logs"])


@router.get(
    "/logs",
    response_model=AuditLogListResponse,
    summary="List Audit Logs",
    description="Mendapatkan daftar catatan audit log. Hanya dapat diakses oleh role admin dan examiner.",
)
async def get_audit_logs(
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100, description="Jumlah record per halaman"),
    offset: int = Query(0, ge=0, description="Offset index record"),
    action: str | None = Query(None, description="Filter berdasarkan jenis aksi"),
    resource_type: str | None = Query(None, description="Filter berdasarkan tipe resource"),
) -> AuditLogListResponse:
    """Mengambil daftar riwayat audit log dengan filter dan paginasi."""
    stmt = select(AuditLog)
    count_stmt = select(func.count()).select_from(AuditLog)

    if action:
        stmt = stmt.where(AuditLog.action == action)
        count_stmt = count_stmt.where(AuditLog.action == action)

    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
        count_stmt = count_stmt.where(AuditLog.resource_type == resource_type)

    # Urutkan dari yang paling baru
    stmt = stmt.order_by(AuditLog.timestamp.desc(), AuditLog.id.desc()).offset(offset).limit(limit)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    result = await db.execute(stmt)
    logs = list(result.scalars().all())

    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/verify",
    response_model=AuditVerifyResponse,
    summary="Verify Audit Chain Integrity",
    description="Memverifikasi keabsahan seluruh hash-chain audit log. Hanya dapat diakses oleh role admin.",
)
async def verify_audit_chain(
    current_user: Annotated[User, Depends(require_role(["admin"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuditVerifyResponse:
    """Memverifikasi integritas hash-chain untuk mendeteksi indikasi modifikasi atau pemutusan rantai log."""
    return await verify_chain_integrity(db)
