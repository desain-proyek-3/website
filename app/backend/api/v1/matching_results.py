"""
Dentify API v1 — Matching Results Endpoints
Pencocokan biometrik 1:N subjek post-mortem (PM) terhadap seluruh subjek
ante-mortem (AM) via cosine similarity pgvector pada tabel `embeddings`
(1 embedding 512-dim per subjek), plus verifikasi human-in-the-loop.

Aturan:
- Hanya subjek aktif (bukan soft-deleted) yang ikut dicocokkan / ditampilkan.
- confidence_score = max(cosine_similarity, 0) × 100 (persen).
- Re-run untuk PM yang sama: baris `pending_review` lama diganti hasil baru;
  baris `confirmed`/`rejected` tidak disentuh dan tidak dibuat ulang.
- Konfirmasi satu kandidat TIDAK otomatis me-reject kandidat lain.
- `matched_by` = user yang menjalankan pencocokan; reviewer tercatat di audit log.

Role akses:
- Admin & Examiner: run, confirm
- Semua role (termasuk Viewer): GET
"""

import uuid
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from core.database import get_db
from dependencies.auth import get_current_user, require_role
from models.embedding import Embedding
from models.matching_result import MatchingResult
from models.subject import Subject
from models.user import User
from schemas.matching_result import (
    MatchingConfirmRequest,
    MatchingResultListResponse,
    MatchingResultResponse,
    MatchingRunRequest,
    MatchingRunResponse,
    MatchingStatus,
)

router = APIRouter(prefix="/matching-results", tags=["Matching Results"])

PmSubject = aliased(Subject)
AmSubject = aliased(Subject)


def _with_active_subjects(stmt):
    """Batasi ke hasil yang subjek PM dan AM-nya masih aktif (bukan soft-deleted)."""
    return (
        stmt.join(PmSubject, MatchingResult.pm_subject_id == PmSubject.id)
        .join(AmSubject, MatchingResult.am_subject_id == AmSubject.id)
        .where(PmSubject.is_deleted == False, AmSubject.is_deleted == False)
    )


def _select_results():
    return _with_active_subjects(select(MatchingResult)).options(
        selectinload(MatchingResult.pm_subject),
        selectinload(MatchingResult.am_subject),
    )


def _confidence_from_cosine(similarity: float) -> float:
    return round(max(similarity, 0.0) * 100, 2)


@router.post(
    "/run",
    response_model=MatchingRunResponse,
    summary="Run AM Matching for a PM Subject",
    description=(
        "Mencocokkan embedding satu subjek post-mortem terhadap seluruh embedding subjek "
        "ante-mortem aktif (cosine similarity pgvector) dan menyimpan top-k kandidat "
        "(default 3) ke matching_results. Hanya untuk role admin dan examiner."
    ),
)
async def run_matching(
    payload: MatchingRunRequest,
    request: Request,
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MatchingRunResponse:
    """Jalankan similarity search 1:N untuk satu subjek PM."""
    # Kunci row subjek PM sampai commit: run paralel untuk PM yang sama (dan
    # penulisan embedding oleh background inferensi) diproses bergiliran, sehingga
    # hapus-lalu-insert baris pending_review di bawah tidak menghasilkan duplikat.
    pm_subject = (
        await db.execute(
            select(Subject)
            .where(Subject.id == payload.pm_subject_id, Subject.is_deleted == False)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if not pm_subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subjek tidak ditemukan atau telah dihapus",
        )
    if pm_subject.subject_type != "post_mortem":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pencocokan hanya dapat dijalankan untuk subjek post-mortem",
        )

    pm_embedding_id = await db.scalar(
        select(Embedding.id).where(Embedding.subject_id == pm_subject.id)
    )
    if not pm_embedding_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Subjek belum diproses AI — belum ada embedding untuk dicocokkan",
        )

    # Similarity search: operator <=> pgvector = cosine distance (1 - cosine similarity)
    pm_vector = select(Embedding.vector).where(Embedding.subject_id == pm_subject.id).scalar_subquery()
    distance = Embedding.vector.cosine_distance(pm_vector)
    ranked = (
        await db.execute(
            select(Embedding.subject_id, (1 - distance).label("similarity"))
            .join(Subject, Subject.id == Embedding.subject_id)
            .where(Subject.subject_type == "ante_mortem", Subject.is_deleted == False)
            .order_by(distance, Embedding.subject_id)
            .limit(payload.top_k)
        )
    ).all()

    # Re-run: kandidat lama yang belum direview diganti hasil baru
    replaced = await db.execute(
        delete(MatchingResult).where(
            MatchingResult.pm_subject_id == pm_subject.id,
            MatchingResult.status == "pending_review",
        )
    )

    # Pasangan PM-AM yang sudah diputuskan reviewer tidak dibuat ulang
    decided: dict[uuid.UUID, uuid.UUID] = {}
    am_ids = [row.subject_id for row in ranked]
    if am_ids:
        decided_rows = await db.execute(
            select(MatchingResult.am_subject_id, MatchingResult.id)
            .where(
                MatchingResult.pm_subject_id == pm_subject.id,
                MatchingResult.am_subject_id.in_(am_ids),
                MatchingResult.status != "pending_review",
            )
            .order_by(MatchingResult.created_at)
        )
        decided = dict(decided_rows.all())

    result_ids: list[uuid.UUID] = []
    for rank, row in enumerate(ranked, start=1):
        if row.subject_id in decided:
            result_ids.append(decided[row.subject_id])
            continue
        similarity = float(row.similarity)
        new_result = MatchingResult(
            id=uuid.uuid4(),
            pm_subject_id=pm_subject.id,
            am_subject_id=row.subject_id,
            cosine_similarity=similarity,
            confidence_score=_confidence_from_cosine(similarity),
            rank=rank,
            matched_by=current_user.id,
            status="pending_review",
        )
        db.add(new_result)
        result_ids.append(new_result.id)

    await db.commit()

    results_by_id = {}
    if result_ids:
        loaded = await db.execute(_select_results().where(MatchingResult.id.in_(result_ids)))
        results_by_id = {r.id: r for r in loaded.scalars().all()}

    request.state.audit_action = "RUN_MATCHING"
    request.state.resource_type = "subjects"
    request.state.resource_id = pm_subject.id
    request.state.audit_details = {
        "top_k": payload.top_k,
        "candidates": len(result_ids),
        "pending_replaced": replaced.rowcount,
    }

    return MatchingRunResponse(
        pm_subject_id=pm_subject.id,
        top_k=payload.top_k,
        candidates=[
            MatchingResultResponse.model_validate(results_by_id[rid])
            for rid in result_ids
            if rid in results_by_id
        ],
    )


@router.get(
    "",
    response_model=MatchingResultListResponse,
    summary="List Matching Results",
    description=(
        "Daftar hasil pencocokan (hanya yang subjek PM & AM-nya aktif), dengan filter "
        "opsional pm_subject_id, am_subject_id, dan status. Dapat diakses semua role."
    ),
)
async def list_matching_results(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100, description="Jumlah record per halaman"),
    offset: int = Query(0, ge=0, description="Offset index record"),
    pm_subject_id: UUID | None = Query(None, description="Filter subjek post-mortem"),
    am_subject_id: UUID | None = Query(None, description="Filter subjek ante-mortem"),
    status_filter: MatchingStatus | None = Query(
        None, alias="status", description="Filter status: pending_review, confirmed, rejected"
    ),
) -> MatchingResultListResponse:
    """Mengambil daftar hasil pencocokan dengan paginasi dan filter."""
    stmt = _select_results()
    count_stmt = _with_active_subjects(select(func.count()).select_from(MatchingResult))

    filters = []
    if pm_subject_id:
        filters.append(MatchingResult.pm_subject_id == pm_subject_id)
    if am_subject_id:
        filters.append(MatchingResult.am_subject_id == am_subject_id)
    if status_filter:
        filters.append(MatchingResult.status == status_filter)
    if filters:
        stmt = stmt.where(*filters)
        count_stmt = count_stmt.where(*filters)

    # Hasil satu run punya created_at sama (satu transaksi) → urut rank di dalamnya
    stmt = (
        stmt.order_by(MatchingResult.created_at.desc(), MatchingResult.rank.asc())
        .offset(offset)
        .limit(limit)
    )

    total = (await db.execute(count_stmt)).scalar_one()
    results = list((await db.execute(stmt)).scalars().all())

    return MatchingResultListResponse(
        items=[MatchingResultResponse.model_validate(r) for r in results],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{id}",
    response_model=MatchingResultResponse,
    summary="Get Matching Result Detail",
    description="Detail satu hasil pencocokan. Dapat diakses semua role.",
)
async def get_matching_result(
    id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MatchingResultResponse:
    """Ambil detail hasil pencocokan berdasarkan ID."""
    result = (
        await db.execute(_select_results().where(MatchingResult.id == id))
    ).scalar_one_or_none()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hasil pencocokan tidak ditemukan",
        )

    request.state.resource_id = result.id
    return MatchingResultResponse.model_validate(result)


@router.post(
    "/{id}/confirm",
    response_model=MatchingResultResponse,
    summary="Confirm or Reject a Match",
    description=(
        "Keputusan odontolog (human-in-the-loop) atas satu kandidat: pending_review → "
        "confirmed/rejected. Keputusan bersifat final (409 bila sudah diputuskan). "
        "Hanya untuk role admin dan examiner."
    ),
)
async def confirm_matching_result(
    id: UUID,
    payload: MatchingConfirmRequest,
    request: Request,
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MatchingResultResponse:
    """Konfirmasi atau tolak satu hasil pencocokan."""
    # FOR UPDATE OF matching_results saja: dua reviewer bersamaan → yang kedua dapat 409
    result = (
        await db.execute(
            _select_results().where(MatchingResult.id == id).with_for_update(of=MatchingResult)
        )
    ).scalar_one_or_none()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hasil pencocokan tidak ditemukan",
        )
    if result.status != "pending_review":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Hasil pencocokan sudah diputuskan (status: {result.status})",
        )

    result.status = payload.decision
    await db.commit()

    request.state.audit_action = "CONFIRM_MATCH" if payload.decision == "confirmed" else "REJECT_MATCH"
    request.state.resource_type = "matching_results"
    request.state.resource_id = result.id
    request.state.audit_details = {
        "pm_subject_id": str(result.pm_subject_id),
        "am_subject_id": str(result.am_subject_id),
    }

    return MatchingResultResponse.model_validate(result)
