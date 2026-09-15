"""
Dentify API v1 — Authentication Endpoints
Endpoints untuk login pengguna dan profil pengguna saat ini.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.user import User
from schemas.user import LoginRequest, TokenResponse, UserResponse
from services.auth_service import authenticate_user, create_user_token

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User Login",
    description="Autentikasi menggunakan username dan password untuk mendapatkan JWT access token.",
)
async def login(
    request: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Login endpoint untuk mendapatkan access token."""
    user = await authenticate_user(db, request.username, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username atau password salah",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return create_user_token(user)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Current User Profile",
    description="Mendapatkan informasi profil user yang sedang terotentikasi berdasarkan JWT token.",
)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Mengembalikan data profil user yang sedang login."""
    return current_user
