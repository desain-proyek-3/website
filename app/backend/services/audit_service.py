"""
Dentify Services — Audit Service
Layanan pencatatan audit log tamper-evident berbasis cryptographic hash-chaining (SHA-256).
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from models.audit_log import AuditLog
from schemas.audit import AuditVerifyResponse, CorruptedEntry

# Kunci integer 32-bit untuk PostgreSQL transaction advisory lock (mengunci urutan penulisan hash-chain)
AUDIT_CHAIN_LOCK_KEY = 104729


def compute_entry_hash(
    previous_hash: str | None,
    timestamp: datetime,
    user_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | None,
    method: str,
    endpoint: str,
    status_code: int,
    details: dict[str, Any] | None,
) -> str:
    """
    Menghitung hash SHA-256 kanonikal deterministik untuk sebuah entri audit log.
    Format kanonikal:
    previous_hash|timestamp_iso|user_id|action|resource_type|resource_id|method|endpoint|status_code|details_json
    """
    prev = previous_hash if previous_hash else "GENESIS"
    ts_str = timestamp.isoformat()
    uid_str = str(user_id) if user_id else ""
    rid_str = str(resource_id) if resource_id else ""
    details_str = json.dumps(details, sort_keys=True, separators=(",", ":")) if details else ""

    canonical_payload = (
        f"{prev}|{ts_str}|{uid_str}|{action}|{resource_type}|{rid_str}|"
        f"{method}|{endpoint}|{status_code}|{details_str}"
    )

    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()


async def create_audit_entry(
    db: AsyncSession,
    action: str,
    resource_type: str,
    method: str,
    endpoint: str,
    status_code: int,
    user_id: uuid.UUID | None = None,
    resource_id: uuid.UUID | None = None,
    ip_address: str | None = None,
    details: dict[str, Any] | None = None,
    timestamp: datetime | None = None,
) -> AuditLog:
    """
    Mencatat satu entri audit log baru secara atomik.
    Mencegah race condition dengan PostgreSQL transaction advisory lock dan FOR UPDATE.
    """
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)

    # 1. Acquire advisory transaction lock untuk menserialisasi penulisan chain
    await db.execute(text(f"SELECT pg_advisory_xact_lock({AUDIT_CHAIN_LOCK_KEY})"))

    # 2. Baca entri terakhir dengan FOR UPDATE
    stmt = (
        select(AuditLog)
        .order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
        .limit(1)
        .with_for_update()
    )
    result = await db.execute(stmt)
    latest_entry = result.scalar_one_or_none()

    previous_hash = latest_entry.entry_hash if latest_entry else None

    # 3. Hitung hash kanonikal baru
    entry_hash = compute_entry_hash(
        previous_hash=previous_hash,
        timestamp=timestamp,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        method=method,
        endpoint=endpoint,
        status_code=status_code,
        details=details,
    )

    # 4. Simpan record audit log baru
    audit_entry = AuditLog(
        timestamp=timestamp,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        method=method,
        endpoint=endpoint,
        status_code=status_code,
        ip_address=ip_address,
        details=details,
        entry_hash=entry_hash,
        previous_hash=previous_hash,
    )

    db.add(audit_entry)
    await db.commit()
    await db.refresh(audit_entry)

    return audit_entry


async def verify_chain_integrity(db: AsyncSession) -> AuditVerifyResponse:
    """
    Memverifikasi integritas seluruh hash-chain dari awal hingga akhir.
    Mendeteksi pemutusan rantai (broken link) atau modifikasi data (tampering).
    """
    stmt = select(AuditLog).order_by(AuditLog.timestamp.asc(), AuditLog.id.asc())
    result = await db.execute(stmt)
    logs = list(result.scalars().all())

    corrupted_entries: list[CorruptedEntry] = []
    expected_prev_hash: str | None = None

    for idx, log in enumerate(logs):
        # 1. Verifikasi kesinambungan previous_hash
        if log.previous_hash != expected_prev_hash:
            corrupted_entries.append(
                CorruptedEntry(
                    index=idx,
                    id=log.id,
                    timestamp=log.timestamp,
                    reason=(
                        f"Hash chain terputus pada indeks {idx}: previous_hash '{log.previous_hash}' "
                        f"tidak cocok dengan entry_hash sebelumnya '{expected_prev_hash}'"
                    ),
                    expected_hash=expected_prev_hash,
                    stored_hash=log.previous_hash,
                )
            )

        # 2. Verifikasi keabsahan data isi entri (recompute hash)
        recomputed_hash = compute_entry_hash(
            previous_hash=log.previous_hash,
            timestamp=log.timestamp,
            user_id=log.user_id,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            method=log.method,
            endpoint=log.endpoint,
            status_code=log.status_code,
            details=log.details,
        )

        if log.entry_hash != recomputed_hash:
            corrupted_entries.append(
                CorruptedEntry(
                    index=idx,
                    id=log.id,
                    timestamp=log.timestamp,
                    reason=(
                        f"Data tampering terdeteksi pada indeks {idx}: entry_hash tersimpan "
                        f"'{log.entry_hash}' tidak cocok dengan hasil kalkulasi ulang '{recomputed_hash}'"
                    ),
                    expected_hash=recomputed_hash,
                    stored_hash=log.entry_hash,
                )
            )

        expected_prev_hash = log.entry_hash

    return AuditVerifyResponse(
        is_valid=len(corrupted_entries) == 0,
        total_entries=len(logs),
        verified_at=datetime.now(timezone.utc),
        corrupted_entries=corrupted_entries,
    )
