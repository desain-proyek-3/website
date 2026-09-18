"""
Dentify API v1 — Subjects Endpoints
CRUD untuk data Subjek forensik Ante-Mortem (AM) dan Post-Mortem (PM).
Mendukung soft-delete untuk menjaga keutuhan chain-of-custody data forensik.
Role akses:
- Admin & Examiner: POST, PUT, DELETE
- Semua role (termasuk Viewer): GET
"""

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user, require_role
from models.subject import Subject
from models.user import User
from schemas.subject import (
    SubjectCreate,
    SubjectListResponse,
    SubjectResponse,
    SubjectType,
    SubjectUpdate,
)

router = APIRouter(prefix="/subjects", tags=["Subjects"])


@router.post(
    "",
    response_model=SubjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Subject",
    description="Menambahkan subjek forensik baru (AM atau PM). Hanya untuk role admin dan examiner.",
)
async def create_subject(
    payload: SubjectCreate,
    request: Request,
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubjectResponse:
    """Buat subjek baru."""
    now = datetime.now(timezone.utc)
    new_subject = Subject(
        subject_type=payload.subject_type,
        full_name=payload.full_name,
        case_reference=payload.case_reference,
        notes=payload.notes,
        created_by=current_user.id,
        created_at=now,
        updated_at=now,
        is_deleted=False,
    )

    db.add(new_subject)
    await db.commit()
    await db.refresh(new_subject)

    # Set metadata untuk audit_middleware
    request.state.audit_action = "CREATE_SUBJECT"
    request.state.resource_type = "subjects"
    request.state.resource_id = new_subject.id

    return SubjectResponse.model_validate(new_subject)


@router.get(
    "",
    response_model=SubjectListResponse,
    summary="List Subjects",
    description="Mendapatkan daftar subjek aktif (bukan soft-deleted). Dapat diakses semua role.",
)
async def list_subjects(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100, description="Jumlah record per halaman"),
    offset: int = Query(0, ge=0, description="Offset index record"),
    subject_type: SubjectType | None = Query(None, description="Filter tipe subjek: ante_mortem atau post_mortem"),
) -> SubjectListResponse:
    """Mengambil daftar subjek dengan paginasi dan filter tipe."""
    stmt = select(Subject).where(Subject.is_deleted == False)
    count_stmt = select(func.count()).select_from(Subject).where(Subject.is_deleted == False)

    if subject_type:
        stmt = stmt.where(Subject.subject_type == subject_type)
        count_stmt = count_stmt.where(Subject.subject_type == subject_type)

    stmt = stmt.order_by(Subject.created_at.desc()).offset(offset).limit(limit)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    result = await db.execute(stmt)
    subjects = list(result.scalars().all())

    return SubjectListResponse(
        items=[SubjectResponse.model_validate(s) for s in subjects],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{id}",
    response_model=SubjectResponse,
    summary="Get Subject Detail",
    description="Mendapatkan detail satu subjek berdasarkan ID. Dapat diakses semua role.",
)
async def get_subject(
    id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubjectResponse:
    """Ambil detail subjek berdasarkan ID."""
    stmt = select(Subject).where(Subject.id == id, Subject.is_deleted == False)
    result = await db.execute(stmt)
    subject = result.scalar_one_or_none()

    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subjek tidak ditemukan atau telah dihapus",
        )

    request.state.resource_id = subject.id
    return SubjectResponse.model_validate(subject)


@router.put(
    "/{id}",
    response_model=SubjectResponse,
    summary="Update Subject",
    description="Memperbarui data subjek secara penuh (PUT). Hanya untuk role admin dan examiner.",
)
async def update_subject(
    id: UUID,
    payload: SubjectUpdate,
    request: Request,
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubjectResponse:
    """Update data subjek."""
    stmt = select(Subject).where(Subject.id == id, Subject.is_deleted == False)
    result = await db.execute(stmt)
    subject = result.scalar_one_or_none()

    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subjek tidak ditemukan atau telah dihapus",
        )

    subject.subject_type = payload.subject_type
    subject.full_name = payload.full_name
    subject.case_reference = payload.case_reference
    subject.notes = payload.notes
    subject.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(subject)

    request.state.audit_action = "UPDATE_SUBJECT"
    request.state.resource_type = "subjects"
    request.state.resource_id = subject.id

    return SubjectResponse.model_validate(subject)


@router.delete(
    "/{id}",
    response_model=SubjectResponse,
    summary="Delete Subject (Soft Delete)",
    description="Menghapus subjek secara lunak (soft-delete). Data fisik tidak dihapus demi kepatuhan chain-of-custody forensik.",
)
async def delete_subject(
    id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubjectResponse:
    """Soft delete subjek."""
    stmt = select(Subject).where(Subject.id == id, Subject.is_deleted == False)
    result = await db.execute(stmt)
    subject = result.scalar_one_or_none()

    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subjek tidak ditemukan atau telah dihapus",
        )

    now = datetime.now(timezone.utc)
    subject.is_deleted = True
    subject.deleted_at = now
    subject.deleted_by = current_user.id

    await db.commit()
    await db.refresh(subject)

    request.state.audit_action = "DELETE_SUBJECT"
    request.state.resource_type = "subjects"
    request.state.resource_id = subject.id

    return SubjectResponse.model_validate(subject)
