"""
Dentify Backend — Hitung ulang kandidat `pending_review` dengan pencocokan per sudut

Sekali jalan setelah deploy schema_phase6_view_matching.sql: kandidat yang belum
direview dan masih dihitung dengan metode lama (rata-rata embedding subjek) diganti
dengan hasil pencocokan per sudut (services/view_matching.py), sama persis seperti
menekan "Cari ulang" untuk setiap subjek PM. Pasangan yang sudah dikonfirmasi/ditolak
TIDAK diubah.

Default = DRY-RUN (hanya menampilkan rank 1 lama vs baru, tidak menulis apa pun).

Laptop (dari app/backend/):
    venv\\Scripts\\python scripts\\rerun_pending_matching.py            # dry-run
    venv\\Scripts\\python scripts\\rerun_pending_matching.py --apply    # tulis
Server (container backend):
    sudo docker exec dentify-backend python scripts/rerun_pending_matching.py
    sudo docker exec dentify-backend python scripts/rerun_pending_matching.py --apply

Opsi: --all-methods  ikut hitung ulang PM yang kandidat pending-nya sudah metode per sudut
      --top-k N      jumlah kandidat (default 3)
Setiap PM yang diproses dengan --apply tercatat di audit log (RUN_MATCHING, tanpa user,
details.source = "rerun_pending_matching").
"""

import argparse
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

import models  # noqa: E402,F401 — registrasi seluruh relasi ORM
from core.database import async_session_factory, engine  # noqa: E402
from models.matching_result import MatchingResult  # noqa: E402
from models.subject import Subject  # noqa: E402
from schemas.matching_result import DEFAULT_TOP_K, MAX_TOP_K  # noqa: E402
from services.audit_service import create_audit_entry  # noqa: E402
from services.view_matching import MATCH_METHOD, pm_view_types, rank_candidates, run_matching_for_pm  # noqa: E402

SCRIPT = "scripts/rerun_pending_matching.py"


def label(subject: Subject | None, subject_id) -> str:
    name = (subject.full_name if subject else None) or "Tanpa nama"
    return f"{name[:28]} ({str(subject_id)[:8]})"


async def main(apply: bool, all_methods: bool, top_k: int) -> int:
    engine.echo = False
    async with async_session_factory() as db:
        stmt = (
            select(MatchingResult)
            .join(Subject, Subject.id == MatchingResult.pm_subject_id)
            .where(MatchingResult.status == "pending_review", Subject.is_deleted == False)  # noqa: E712
            .order_by(MatchingResult.pm_subject_id, MatchingResult.rank)
        )
        if not all_methods:
            stmt = stmt.where(MatchingResult.match_method.is_(None))
        pending = (await db.scalars(stmt)).all()
        by_pm: dict = {}
        for row in pending:
            by_pm.setdefault(row.pm_subject_id, []).append(row)
        ids = set(by_pm) | {r.am_subject_id for r in pending}
        subjects = {s.id: s for s in (await db.scalars(select(Subject).where(Subject.id.in_(ids))))} if ids else {}

    mode = "APPLY" if apply else "DRY-RUN (tidak ada yang ditulis; tambahkan --apply untuk menyimpan)"
    print(f"[{mode}] PM dengan kandidat pending{'' if all_methods else ' metode lama'}: {len(by_pm)}")
    changed = skipped = 0

    for pm_id, old_rows in by_pm.items():
        pm = subjects.get(pm_id)
        old_top = old_rows[0]
        async with async_session_factory() as db:
            # Kunci subjek PM seperti endpoint /run (serialisasi dengan inferensi & run lain)
            locked = await db.scalar(
                select(Subject).where(Subject.id == pm_id, Subject.is_deleted == False).with_for_update()  # noqa: E712
            )
            views = await pm_view_types(db, pm_id) if locked else []
            if not views:
                print(f"- {label(pm, pm_id)}: DILEWATI — belum ada embedding per sudut")
                skipped += 1
                continue

            if apply:
                outcome = await run_matching_for_pm(db, pm_id, top_k, old_top.matched_by)
                await db.commit()
                top = outcome.candidates[0] if outcome.candidates else None
            else:
                outcome = await rank_candidates(db, pm_id)
                top = outcome.candidates[0] if outcome.candidates else None
                await db.rollback()

        new_name = label(subjects.get(top.am_subject_id) if top else None, top.am_subject_id) if top else "-"
        if top and top.am_subject_id not in subjects:
            async with async_session_factory() as db:
                s = await db.get(Subject, top.am_subject_id)
                new_name = label(s, top.am_subject_id)
        same = bool(top) and top.am_subject_id == old_top.am_subject_id
        changed += 0 if same else 1
        detail = ""
        if top:
            per_view = " · ".join(f"{v} {s['cos']:.4f}(#{s['rank']})" for v, s in top.view_scores.items())
            detail = f" skor {top.score:.4f} [{per_view}]"
        print(
            f"- {label(pm, pm_id)} sudut PM {'/'.join(views)}: rank 1 lama {label(subjects.get(old_top.am_subject_id), old_top.am_subject_id)}"
            f" (cos {old_top.cosine_similarity or 0:.4f}) -> baru {new_name}{detail}{'  (sama)' if same else '  << BERUBAH'}"
        )

        if apply:
            async with async_session_factory() as db:
                await create_audit_entry(
                    db=db,
                    action="RUN_MATCHING",
                    resource_type="subjects",
                    method="SCRIPT",
                    endpoint=SCRIPT,
                    status_code=200,
                    user_id=None,
                    resource_id=pm_id,
                    ip_address=None,
                    details={
                        "source": "rerun_pending_matching",
                        "method": MATCH_METHOD,
                        "top_k": top_k,
                        "candidates": len(outcome.result_ids),
                        "pending_replaced": outcome.pending_replaced,
                        "pm_views": outcome.pm_views,
                        "previous_rank1": str(old_top.am_subject_id),
                        "new_rank1": str(top.am_subject_id) if top else None,
                    },
                )

    await engine.dispose()
    print(f"Selesai: {len(by_pm) - skipped} PM dihitung, {changed} rank 1 berubah, {skipped} dilewati.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Hitung ulang kandidat pending_review dengan pencocokan per sudut")
    parser.add_argument("--apply", action="store_true", help="simpan hasil (default: dry-run)")
    parser.add_argument("--all-methods", action="store_true", help="ikut hitung ulang PM yang sudah metode per sudut")
    parser.add_argument("--top-k", type=int, default=DEFAULT_TOP_K)
    args = parser.parse_args()
    if not 1 <= args.top_k <= MAX_TOP_K:
        parser.error(f"--top-k harus 1..{MAX_TOP_K}")
    sys.exit(asyncio.run(main(args.apply, args.all_methods, args.top_k)))
