"""
Dentify Tests — Audit Log Hash-Chain (urutan timestamp di bawah penulisan paralel)
Regresi untuk bug Pekan 10 (be-handover.md §6 #23): timestamp entri dulu diisi SEBELUM
pg_advisory_xact_lock, sehingga pada request paralel urutan timestamp ≠ urutan rantai
dan GET /audit/verify melapor "hash chain terputus" palsu.

Test memanggil services.audit_service langsung ke DB (tidak butuh server FastAPI).
DB dev bisa sudah berisi entri rusak lama dari bug ini, jadi yang diverifikasi hanya
SEGMEN rantai yang ditulis test ini (disambung ke entri terakhir sebelum test):
1. 60 penulisan paralel → segmen tersambung utuh, hash valid, timestamp naik ketat
2. Skenario bug direproduksi deterministik: timestamp "basi" (diambil sebelum lock)
   dipaksa > timestamp entri terakhir
3. Deteksi tampering tetap bekerja (UPDATE di dalam transaksi lalu rollback)

Jalankan dari direktori app/backend/ (Docker Postgres harus aktif):
    python -m unittest tests.test_audit_chain -v

Entri uji (action TEST_AUDIT_*) dihapus di akhir HANYA bila masih berada di ujung
rantai (menghapus ujung rantai tidak memutus entri sebelumnya).
"""

import asyncio
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete, func, select, update

import models  # noqa: F401 — registrasi seluruh relasi ORM
from core.database import async_session_factory, engine
from models.audit_log import AuditLog
from services.audit_service import compute_entry_hash, create_audit_entry, verify_chain_integrity

TEST_ACTION_PREFIX = "TEST_AUDIT_"
PARALLEL_WRITES = 60


def run(coro_factory):
    """Jalankan satu skenario async di event loop baru, lalu lepaskan pool koneksi."""
    async def runner():
        try:
            return await coro_factory()
        finally:
            await engine.dispose()
    return asyncio.run(runner())


async def _latest_entry() -> AuditLog | None:
    async with async_session_factory() as s:
        return (
            await s.execute(select(AuditLog).order_by(AuditLog.timestamp.desc(), AuditLog.id.desc()).limit(1))
        ).scalar_one_or_none()


async def _write(action: str, timestamp: datetime | None = None) -> AuditLog:
    async with async_session_factory() as s:
        return await create_audit_entry(
            db=s,
            action=action,
            resource_type="test",
            method="POST",
            endpoint="/test/audit-chain",
            status_code=200,
            details={"source": "test_audit_chain"},
            timestamp=timestamp,
        )


async def _segment_after(anchor: AuditLog | None) -> list[AuditLog]:
    """Seluruh entri setelah anchor, urut seperti verify_chain_integrity()."""
    async with async_session_factory() as s:
        stmt = select(AuditLog).order_by(AuditLog.timestamp.asc(), AuditLog.id.asc())
        if anchor is not None:
            stmt = stmt.where(AuditLog.timestamp > anchor.timestamp)
        return list((await s.execute(stmt)).scalars().all())


def _recompute(log: AuditLog) -> str:
    return compute_entry_hash(
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


async def _cleanup_test_tail() -> int:
    """Hapus entri uji hanya bila tidak ada entri non-uji yang ditulis sesudahnya."""
    async with async_session_factory() as s:
        first_test_ts = await s.scalar(
            select(func.min(AuditLog.timestamp)).where(AuditLog.action.startswith(TEST_ACTION_PREFIX))
        )
        if first_test_ts is None:
            return 0
        foreign_after = await s.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(AuditLog.timestamp >= first_test_ts, ~AuditLog.action.startswith(TEST_ACTION_PREFIX))
        )
        if foreign_after:
            print(f"\n[test_audit_chain] {foreign_after} entri non-uji tertulis di tengah — entri uji dibiarkan.")
            return 0
        res = await s.execute(delete(AuditLog).where(AuditLog.timestamp >= first_test_ts))
        await s.commit()
        return res.rowcount


class TestAuditChain(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        run(_cleanup_test_tail)

    def assertSegmentIntact(self, anchor: AuditLog | None, segment: list[AuditLog]) -> None:
        expected_prev = anchor.entry_hash if anchor else None
        prev_ts = anchor.timestamp if anchor else None
        for i, log in enumerate(segment):
            self.assertEqual(log.previous_hash, expected_prev, f"rantai terputus pada entri #{i} ({log.action})")
            self.assertEqual(log.entry_hash, _recompute(log), f"hash entri #{i} tidak valid")
            if prev_ts is not None:
                self.assertGreater(log.timestamp, prev_ts, f"timestamp entri #{i} tidak naik ketat")
            expected_prev = log.entry_hash
            prev_ts = log.timestamp

    def test_01_parallel_writes_keep_chain_and_timestamp_order(self):
        async def scenario():
            anchor = await _latest_entry()
            await asyncio.gather(*[_write(f"{TEST_ACTION_PREFIX}PARALLEL_{i:02d}") for i in range(PARALLEL_WRITES)])
            return anchor, await _segment_after(anchor)

        anchor, segment = run(scenario)
        self.assertEqual(len(segment), PARALLEL_WRITES)
        self.assertTrue(all(log.action.startswith(TEST_ACTION_PREFIX) for log in segment))
        self.assertSegmentIntact(anchor, segment)

    def test_02_stale_timestamp_is_bumped_after_latest(self):
        """Reproduksi bug: task yang now()-nya diambil sebelum lock mendapat lock belakangan."""
        async def scenario():
            stale = datetime.now(timezone.utc) - timedelta(seconds=5)
            first = await _write(f"{TEST_ACTION_PREFIX}FRESH")
            second = await _write(f"{TEST_ACTION_PREFIX}STALE", timestamp=stale)
            return first, second

        first, second = run(scenario)
        self.assertGreater(second.timestamp, first.timestamp)
        self.assertEqual(second.previous_hash, first.entry_hash)

    def test_03_tampering_still_detected(self):
        async def scenario():
            target = await _write(f"{TEST_ACTION_PREFIX}TAMPER_TARGET")
            async with async_session_factory() as s:
                await s.execute(update(AuditLog).where(AuditLog.id == target.id).values(action="TAMPERED_ACTION"))
                report = await verify_chain_integrity(s)
                await s.rollback()
            return target, report

        target, report = run(scenario)
        self.assertFalse(report.is_valid)
        self.assertIn(target.id, {c.id for c in report.corrupted_entries})


if __name__ == "__main__":
    unittest.main()
