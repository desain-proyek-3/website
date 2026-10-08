"""
Dentify API v1 — User Management Endpoints
Manajemen akun pengguna oleh admin (pengganti self-signup publik).
Tidak ada endpoint DELETE: akun dinonaktifkan via is_active=false, karena row user
dirujuk oleh created_by (subjects, inference_jobs) dan audit log.
Role akses:
- Admin saja: GET list, GET detail, POST, PUT
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import hash_password
from dependencies.auth import require_role
from models.user import User
from schemas.user import (
    UserCreate,
    UserListResponse,
    UserResponse,
    UserRole,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["Users"])

AdminUser = Annotated[User, Depends(require_role(["admin"]))]


async def _get_user_or_404(db: AsyncSession, user_id: UUID) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User tidak ditemukan",
        )
    return user


async def _ensure_unique(
    db: AsyncSession,
    *,
    username: str | None = None,
    email: str,
    exclude_id: UUID | None = None,
) -> None:
    """Raise 409 jika username/email sudah dipakai akun lain."""
    conditions = [func.lower(User.email) == email]
    if username is not None:
        conditions.append(func.lower(User.username) == username.lower())
    stmt = select(User).where(or_(*conditions))
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    existing = (await db.execute(stmt)).scalars().first()
    if existing:
        field = "Email" if existing.email.lower() == email else "Username"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{field} sudah digunakan oleh akun lain",
        )


@router.get(
    "",
    response_model=UserListResponse,
    summary="List Users",
    description="Daftar seluruh akun pengguna. Hanya untuk role admin.",
)
async def list_users(
    current_user: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100, description="Jumlah record per halaman"),
    offset: int = Query(0, ge=0, description="Offset index record"),
    role: UserRole | None = Query(None, description="Filter role: admin, examiner, atau viewer"),
    is_active: bool | None = Query(None, description="Filter status aktif"),
) -> UserListResponse:
    stmt = select(User)
    count_stmt = select(func.count()).select_from(User)
    if role:
        stmt = stmt.where(User.role == role)
        count_stmt = count_stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
        count_stmt = count_stmt.where(User.is_active == is_active)

    stmt = stmt.order_by(User.created_at.desc()).offset(offset).limit(limit)
    total = (await db.execute(count_stmt)).scalar_one()
    users = list((await db.execute(stmt)).scalars().all())

    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{id}",
    response_model=UserResponse,
    summary="Get User Detail",
    description="Detail satu akun pengguna. Hanya untuk role admin.",
)
async def get_user(
    id: UUID,
    request: Request,
    current_user: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    user = await _get_user_or_404(db, id)
    request.state.resource_id = user.id
    return UserResponse.model_validate(user)


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create User",
    description="Membuat akun pengguna baru dengan password awal dari admin. Hanya untuk role admin.",
)
async def create_user(
    payload: UserCreate,
    request: Request,
    current_user: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    email = payload.email.strip().lower()
    await _ensure_unique(db, username=payload.username, email=email)

    new_user = User(
        username=payload.username,
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        full_name=payload.full_name.strip(),
        is_active=True,
    )
    db.add(new_user)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username atau email sudah digunakan oleh akun lain",
        ) from e
    await db.refresh(new_user)

    request.state.audit_action = "CREATE_USER"
    request.state.resource_type = "users"
    request.state.resource_id = new_user.id
    request.state.audit_details = {"username": new_user.username, "role": new_user.role}

    return UserResponse.model_validate(new_user)


@router.put(
    "/{id}",
    response_model=UserResponse,
    summary="Update User",
    description=(
        "Memperbarui profil, role, dan status aktif akun (PUT). Field `password` opsional "
        "untuk reset password oleh admin. Hanya untuk role admin."
    ),
)
async def update_user(
    id: UUID,
    payload: UserUpdate,
    request: Request,
    current_user: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    user = await _get_user_or_404(db, id)
    email = payload.email.strip().lower()
    await _ensure_unique(db, email=email, exclude_id=user.id)

    loses_admin = user.role == "admin" and user.is_active and (
        payload.role != "admin" or not payload.is_active
    )
    if loses_admin:
        # Cegah sistem terkunci tanpa admin.
        if user.id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Anda tidak dapat menonaktifkan atau menurunkan role akun Anda sendiri",
            )
        other_admins = (
            await db.execute(
                select(func.count())
                .select_from(User)
                .where(User.role == "admin", User.is_active == True, User.id != user.id)
            )
        ).scalar_one()
        if other_admins == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Harus ada minimal satu admin aktif",
            )

    changes = [
        name
        for name, old, new in (
            ("email", user.email, email),
            ("full_name", user.full_name, payload.full_name.strip()),
            ("role", user.role, payload.role),
            ("is_active", user.is_active, payload.is_active),
        )
        if old != new
    ]
    if payload.password:
        changes.append("password")

    user.email = email
    user.full_name = payload.full_name.strip()
    user.role = payload.role
    user.is_active = payload.is_active
    if payload.password:
        user.password_hash = hash_password(payload.password)

    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email sudah digunakan oleh akun lain",
        ) from e
    await db.refresh(user)

    request.state.audit_action = "UPDATE_USER"
    request.state.resource_type = "users"
    request.state.resource_id = user.id
    request.state.audit_details = {"changed_fields": changes}

    return UserResponse.model_validate(user)
