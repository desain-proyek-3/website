"""
Dentify Services — Pencocokan per sudut (PM vs AM)

Embedding citra PM sudut X HANYA dibandingkan dengan embedding citra AM sudut X
(tabel `view_embeddings`, cosine similarity pgvector). Skor kandidat AM:

    skor = rata-rata cosine sudut yang sama (sudut yang dimiliki PM & AM)

Rincian disimpan per kandidat di `matching_results.view_scores`
({"depan": {"cos": 0.9371, "rank": 1}, ...}; rank = peringkat AM itu di antara semua AM
untuk sudut tersebut) + `views_compared` + `match_method = 'per_view'`.

Alasan (diagnostik 26 Nov, PM uji = foto Gangsar yang dikotori): cara lama
(rata-rata 3 sudut PM vs rata-rata 3 sudut AM) memilih kandidat salah dengan selisih
0,0005; perbandingan sudut yang sama memilih Gangsar di 2 dari 3 sudut, selisih 0,0084.

Aturan (keputusan pengguna 26 Nov):
- AM tanpa satu pun sudut yang sama dengan PM TIDAK ikut kandidat (jumlahnya dilaporkan).
- Peringkat murni berdasarkan skor rata-rata; cakupan sudut ditampilkan, bukan penalti
  (seri → kandidat dengan lebih banyak sudut didahulukan).
- confidence_score = max(skor, 0) × 100 (rumus sama seperti sebelumnya).
- Re-run: baris `pending_review` lama diganti; pasangan yang sudah diputuskan reviewer
  tidak dibuat ulang (dikembalikan apa adanya).
"""

import uuid
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import delete, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from models.matching_result import MatchingResult
from models.subject import Subject
from models.view_embedding import ViewEmbedding

VIEW_ORDER = ("depan", "kiri", "kanan")
MATCH_METHOD = "per_view"


@dataclass
class Candidate:
    am_subject_id: UUID
    score: float
    view_scores: dict[str, dict[str, float | int]]

    @property
    def views_compared(self) -> int:
        return len(self.view_scores)


@dataclass
class MatchingOutcome:
    pm_views: list[str]
    candidates: list[Candidate]  # semua AM yang bisa dibandingkan, terurut
    am_without_common_view: int
    result_ids: list[uuid.UUID] = field(default_factory=list)
    pending_replaced: int = 0


def confidence_from_score(score: float) -> float:
    return round(max(score, 0.0) * 100, 2)


async def pm_view_types(db: AsyncSession, pm_subject_id: UUID) -> list[str]:
    views = set(
        (await db.scalars(select(ViewEmbedding.view_type).where(ViewEmbedding.subject_id == pm_subject_id))).all()
    )
    return [v for v in VIEW_ORDER if v in views]


async def rank_candidates(db: AsyncSession, pm_subject_id: UUID) -> MatchingOutcome:
    """Skor seluruh AM aktif terhadap PM, sudut demi sudut (tanpa menulis apa pun)."""
    pm_views = await pm_view_types(db, pm_subject_id)

    pm = (
        select(ViewEmbedding.view_type.label("view_type"), ViewEmbedding.vector.label("vector"))
        .where(ViewEmbedding.subject_id == pm_subject_id)
        .cte("pm_views")
    )
    am = aliased(ViewEmbedding)
    active_am = (Subject.subject_type == "ante_mortem", Subject.is_deleted == False)  # noqa: E712
    pairs = (
        await db.execute(
            select(
                am.subject_id.label("am_id"),
                am.view_type.label("view_type"),
                (1 - am.vector.cosine_distance(pm.c.vector)).label("cos"),
            )
            .join(pm, pm.c.view_type == am.view_type)
            .join(Subject, Subject.id == am.subject_id)
            .where(*active_am)
        )
    ).all()

    # Peringkat per sudut (di antara semua AM yang punya sudut itu)
    per_view: dict[str, list[tuple[UUID, float]]] = {}
    for row in pairs:
        per_view.setdefault(row.view_type, []).append((row.am_id, float(row.cos)))
    view_scores: dict[UUID, dict[str, dict[str, float | int]]] = {}
    for view in VIEW_ORDER:
        ranked = sorted(per_view.get(view, []), key=lambda x: (-x[1], str(x[0])))
        for rank, (am_id, cos) in enumerate(ranked, start=1):
            view_scores.setdefault(am_id, {})[view] = {"cos": round(cos, 6), "rank": rank}

    candidates = [
        Candidate(am_subject_id=am_id, score=sum(v["cos"] for v in scores.values()) / len(scores), view_scores=scores)
        for am_id, scores in view_scores.items()
    ]
    candidates.sort(key=lambda c: (-c.score, -c.views_compared, str(c.am_subject_id)))

    am_with_views = await db.scalar(
        select(func.count(distinct(ViewEmbedding.subject_id)))
        .join(Subject, Subject.id == ViewEmbedding.subject_id)
        .where(*active_am)
    )
    return MatchingOutcome(
        pm_views=pm_views,
        candidates=candidates,
        am_without_common_view=max((am_with_views or 0) - len(candidates), 0),
    )


async def run_matching_for_pm(
    db: AsyncSession, pm_subject_id: UUID, top_k: int, matched_by: UUID | None
) -> MatchingOutcome:
    """
    Hitung kandidat lalu GANTI baris `pending_review` PM ini dengan top-k baru.
    Pasangan yang sudah diputuskan reviewer dikembalikan apa adanya. Tidak commit.
    Pemanggil wajib mengunci row subjek PM (SELECT ... FOR UPDATE) dan memastikan PM
    punya minimal satu embedding sudut.
    """
    outcome = await rank_candidates(db, pm_subject_id)
    top = outcome.candidates[:top_k]

    replaced = await db.execute(
        delete(MatchingResult).where(
            MatchingResult.pm_subject_id == pm_subject_id,
            MatchingResult.status == "pending_review",
        )
    )
    outcome.pending_replaced = replaced.rowcount or 0

    decided: dict[UUID, uuid.UUID] = {}
    if top:
        decided_rows = await db.execute(
            select(MatchingResult.am_subject_id, MatchingResult.id)
            .where(
                MatchingResult.pm_subject_id == pm_subject_id,
                MatchingResult.am_subject_id.in_([c.am_subject_id for c in top]),
                MatchingResult.status != "pending_review",
            )
            .order_by(MatchingResult.created_at)
        )
        decided = dict(decided_rows.all())

    for rank, cand in enumerate(top, start=1):
        if cand.am_subject_id in decided:
            outcome.result_ids.append(decided[cand.am_subject_id])
            continue
        row = MatchingResult(
            id=uuid.uuid4(),
            pm_subject_id=pm_subject_id,
            am_subject_id=cand.am_subject_id,
            cosine_similarity=cand.score,
            confidence_score=confidence_from_score(cand.score),
            rank=rank,
            matched_by=matched_by,
            status="pending_review",
            view_scores=cand.view_scores,
            views_compared=cand.views_compared,
            match_method=MATCH_METHOD,
        )
        db.add(row)
        outcome.result_ids.append(row.id)
    return outcome
