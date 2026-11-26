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
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from core.database import get_db
from dependencies.auth import get_current_user, require_role
from models.audit_log import AuditLog
from models.dental_image import DentalImage
from models.embedding import Embedding
from models.matching_result import MatchingResult
from models.subject import Subject
from models.tooth_record import ToothRecord
from models.user import User
from schemas.dental_comparison import (
    DentalComparisonResponse,
    IdentificationReportResponse,
    ImageCoverage,
    ReportDecision,
    ReportImage,
    ReportNarrative,
    ReportPerson,
    ReportSubject,
    SubjectCoverage,
)
from services.dental_comparison import (
    ToothObservation,
    compare_dentition,
    normalize_confidence,
    normalize_morphology,
)
from services.rag_service_client import RAGServiceError, build_report_payload, rag_service_client
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


# ── Perbandingan gigi PM vs AM & laporan identifikasi ───────────────

async def _get_active_result(db: AsyncSession, id: UUID) -> MatchingResult:
    result = (await db.execute(_select_results().where(MatchingResult.id == id))).scalar_one_or_none()
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hasil pencocokan tidak ditemukan",
        )
    return result


async def _build_comparison(
    db: AsyncSession, result: MatchingResult
) -> tuple[DentalComparisonResponse, list[DentalImage], dict[UUID, int]]:
    """Kumpulkan tooth_records citra aktif kedua subjek lalu bandingkan per FDI."""
    subject_ids = [result.pm_subject_id, result.am_subject_id]
    images = list(
        (
            await db.execute(
                select(DentalImage)
                .where(DentalImage.subject_id.in_(subject_ids), DentalImage.is_deleted == False)
                .order_by(DentalImage.uploaded_at)
            )
        ).scalars().all()
    )
    image_by_id = {img.id: img for img in images}

    records = (
        await db.execute(
            select(
                ToothRecord.dental_image_id,
                ToothRecord.fdi_number,
                ToothRecord.confidence_score,
                ToothRecord.morphology_features,
            ).where(ToothRecord.dental_image_id.in_(image_by_id.keys()))
        )
    ).all() if image_by_id else []

    teeth_per_image: dict[UUID, int] = {img.id: 0 for img in images}
    observations: dict[UUID, list[ToothObservation]] = {sid: [] for sid in subject_ids}
    for rec in records:
        img = image_by_id[rec.dental_image_id]
        teeth_per_image[img.id] += 1
        observations[img.subject_id].append(
            ToothObservation(
                fdi_number=rec.fdi_number,
                view_type=img.view_type,
                confidence=normalize_confidence(rec.confidence_score),
                morphology=normalize_morphology(rec.morphology_features),
            )
        )

    def coverage(subject_id: UUID) -> SubjectCoverage:
        own = [img for img in images if img.subject_id == subject_id]
        return SubjectCoverage(
            subject_id=subject_id,
            images=[
                ImageCoverage(dental_image_id=img.id, view_type=img.view_type, teeth_detected=teeth_per_image[img.id])
                for img in own
            ],
            images_total=len(own),
            images_with_results=sum(1 for img in own if teeth_per_image[img.id] > 0),
        )

    teeth, summary = compare_dentition(observations[result.pm_subject_id], observations[result.am_subject_id])
    comparison = DentalComparisonResponse(
        matching_result=MatchingResultResponse.model_validate(result),
        pm_coverage=coverage(result.pm_subject_id),
        am_coverage=coverage(result.am_subject_id),
        summary=summary,
        teeth=teeth,
    )
    return comparison, images, teeth_per_image


@router.get(
    "/{id}/comparison",
    response_model=DentalComparisonResponse,
    summary="Compare PM vs AM Teeth",
    description=(
        "Perbandingan hasil deteksi AI per gigi (FDI) antara subjek PM dan kandidat AM: "
        "keberadaan gigi, confidence, dan delta tiap fitur morfologi. Hasil 3 sudut citra "
        "digabung (confidence tertinggi). Tersedia untuk semua status review dan semua role."
    ),
)
async def compare_matching_result(
    id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DentalComparisonResponse:
    result = await _get_active_result(db, id)
    comparison, _, _ = await _build_comparison(db, result)
    request.state.resource_id = result.id
    return comparison


def _person(user: User | None) -> ReportPerson | None:
    if user is None:
        return None
    return ReportPerson(id=user.id, username=user.username, full_name=user.full_name)


def _ensure_confirmed(result: MatchingResult) -> None:
    if result.status != "confirmed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Laporan identifikasi hanya tersedia untuk pasangan yang sudah dikonfirmasi "
                f"odontolog (status saat ini: {result.status})"
            ),
        )


def _report_scores(result: MatchingResult, comparison: DentalComparisonResponse) -> dict:
    return {
        "cosine_similarity": result.cosine_similarity,
        "confidence_score": comparison.matching_result.confidence_score,
        "rank": result.rank,
        "superimposition_score": result.superimposition_score,
        "morphology_diff_score": result.morphology_diff_score,
    }


def _narrative_from_stored(stored: dict | None, generated_at: datetime | None) -> ReportNarrative:
    """Status Bagian 4 laporan dari narasi tersimpan (tanpa memanggil layanan RAG)."""
    if stored:
        return ReportNarrative(status="available", generated_at=generated_at, **stored)
    if not rag_service_client.configured:
        return ReportNarrative(
            status="not_available",
            message="Analisis AI tidak tersedia — layanan analisis AI belum dikonfigurasi.",
        )
    return ReportNarrative(status="pending")


@router.get(
    "/{id}/report",
    response_model=IdentificationReportResponse,
    summary="Generate INTERPOL DVI Identification Report",
    description=(
        "Laporan identifikasi format INTERPOL DVI untuk pasangan PM–AM yang sudah "
        "DIKONFIRMASI odontolog (status lain → 409): identitas subjek, skor pencocokan, "
        "keputusan reviewer, perbandingan gigi, chain-of-custody citra (SHA-256), dan "
        "Analisis AI (narasi Agentic RAG). Narasi TIDAK dibuat di sini agar laporan tampil "
        "cepat: status 'available' bila sudah tersimpan, 'pending' bila belum (frontend lalu "
        "memanggil POST /{id}/report/narrative), 'not_available' bila layanan RAG tidak "
        "dikonfigurasi. Data lain disusun ulang setiap diminta. Dapat diakses semua role."
    ),
)
async def get_identification_report(
    id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IdentificationReportResponse:
    result = await _get_active_result(db, id)
    _ensure_confirmed(result)

    comparison, images, teeth_per_image = await _build_comparison(db, result)
    pm, am = result.pm_subject, result.am_subject

    # Keputusan reviewer & pengunggah citra hanya tercatat di audit log
    decision_log = (
        await db.execute(
            select(AuditLog)
            .where(
                AuditLog.action == "CONFIRM_MATCH",
                AuditLog.resource_id == result.id,
                AuditLog.status_code < 400,
            )
            .order_by(AuditLog.timestamp.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    upload_logs = (
        await db.execute(
            select(AuditLog.resource_id, AuditLog.user_id)
            .where(
                AuditLog.action == "UPLOAD_DENTAL_IMAGE",
                AuditLog.resource_id.in_([img.id for img in images]),
                AuditLog.status_code < 400,
            )
        )
    ).all() if images else []
    uploader_by_image = {row.resource_id: row.user_id for row in upload_logs}

    user_ids = {
        uid
        for uid in [
            pm.created_by,
            am.created_by,
            result.matched_by,
            decision_log.user_id if decision_log else None,
            *uploader_by_image.values(),
        ]
        if uid
    }
    users = {
        u.id: u for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
    } if user_ids else {}

    def subject_section(s: Subject) -> ReportSubject:
        return ReportSubject(
            id=s.id,
            subject_type=s.subject_type,
            full_name=s.full_name,
            case_reference=s.case_reference,
            notes=s.notes,
            created_at=s.created_at,
            created_by=_person(users.get(s.created_by)),
        )

    scores = _report_scores(result, comparison)
    narrative = _narrative_from_stored(result.report_narrative, result.report_narrative_at)

    request.state.audit_action = "GENERATE_REPORT"
    request.state.resource_type = "matching_results"
    request.state.resource_id = result.id
    request.state.audit_details = {"narrative": narrative.status}

    return IdentificationReportResponse(
        generated_at=datetime.now(timezone.utc),
        generated_by=_person(current_user),
        matching_result_id=result.id,
        case_reference=pm.case_reference,
        pm_subject=subject_section(pm),
        am_subject=subject_section(am),
        scores=scores,
        decision=ReportDecision(
            status=result.status,
            decided_by=_person(users.get(decision_log.user_id)) if decision_log else None,
            decided_at=decision_log.timestamp if decision_log else None,
            matched_by=_person(users.get(result.matched_by)),
            matched_at=result.created_at,
        ),
        comparison=comparison,
        images=[
            ReportImage(
                dental_image_id=img.id,
                subject_id=img.subject_id,
                view_type=img.view_type,
                file_hash=img.file_hash,
                device_id=img.device_id,
                captured_at=img.captured_at,
                uploaded_at=img.uploaded_at,
                uploaded_by=_person(users.get(uploader_by_image.get(img.id))),
                teeth_detected=teeth_per_image[img.id],
            )
            for img in images
        ],
        narrative=narrative,
    )


@router.post(
    "/{id}/report/narrative",
    response_model=ReportNarrative,
    summary="Generate AI Analysis (RAG Narrative) for an Identification Report",
    description=(
        "Membuat Bagian 4 'Analisis AI' laporan lewat layanan Agentic RAG lalu menyimpannya, "
        "sehingga laporan berikutnya (dan PDF cetak) memakai narasi yang sama. Bila narasi sudah "
        "tersimpan, dikembalikan tanpa memanggil layanan (idempoten). Hanya hasil sukses yang "
        "disimpan; kegagalan → 502 (504 bila timeout) dan boleh dicoba lagi. Layanan tidak "
        "dikonfigurasi → 200 status 'not_available'. Pasangan harus 'confirmed' (409). "
        "Dapat diakses semua role (narasi dibutuhkan untuk mencetak laporan)."
    ),
)
async def generate_report_narrative(
    id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReportNarrative:
    result = await _get_active_result(db, id)
    _ensure_confirmed(result)

    request.state.audit_action = "GENERATE_REPORT_NARRATIVE"
    request.state.resource_type = "matching_results"
    request.state.resource_id = result.id

    if result.report_narrative or not rag_service_client.configured:
        narrative = _narrative_from_stored(result.report_narrative, result.report_narrative_at)
        request.state.audit_details = {"narrative": narrative.status, "cached": narrative.status == "available"}
        return narrative

    comparison, _, _ = await _build_comparison(db, result)
    payload = build_report_payload(
        str(result.id),
        result.pm_subject,
        result.am_subject,
        _report_scores(result, comparison),
        comparison.summary,
        comparison.teeth,
    )
    # Panggilan RAG bisa sampai RAG_SERVICE_TIMEOUT_SECONDS → akhiri transaksi baca dulu
    # agar koneksi DB tidak ditahan (idle in transaction) selama menunggu.
    await db.commit()

    try:
        stored = await rag_service_client.generate_narrative(payload)
    except RAGServiceError as e:
        request.state.audit_details = {"narrative": "failed", "timeout": e.timeout}
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT if e.timeout else status.HTTP_502_BAD_GATEWAY,
            detail=e.message,
        ) from e

    # Simpan hanya bila belum ada: dua pengguna yang membuka laporan bersamaan → hasil
    # pertama yang dipakai, agar semua cetakan laporan berisi narasi yang sama.
    row = (
        await db.execute(
            update(MatchingResult)
            .where(MatchingResult.id == result.id, MatchingResult.report_narrative.is_(None))
            .values(report_narrative=stored, report_narrative_at=func.now())
            .returning(MatchingResult.report_narrative, MatchingResult.report_narrative_at)
        )
    ).one_or_none()
    saved = row is not None
    if not saved:
        row = (
            await db.execute(
                select(MatchingResult.report_narrative, MatchingResult.report_narrative_at)
                .where(MatchingResult.id == result.id)
            )
        ).one()

    narrative = _narrative_from_stored(row.report_narrative, row.report_narrative_at)
    request.state.audit_details = {
        "narrative": narrative.status,
        "cached": not saved,
        "engine": narrative.engine,
        "model_version": narrative.model_version,
        "references": len(narrative.references),
    }
    return narrative


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
