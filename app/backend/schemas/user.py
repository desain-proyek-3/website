"""
Dentify Schemas — User & Authentication
Pydantic models untuk request login, response token, dan user profile.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Definisi literal role user yang konsisten dengan tipe enum di PostgreSQL (user_role)
UserRole = Literal["admin", "examiner", "viewer"]


class LoginRequest(BaseModel):
    """Payload request untuk login user."""
    username: str
    password: str


class TokenResponse(BaseModel):
    """Response payload yang mengembalikan access token JWT."""
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """Response payload data user (tanpa password_hash)."""
    id: UUID
    username: str
    email: str
    role: UserRole
    full_name: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Validasi email sederhana (tanpa dependency email-validator): ada "@" dan domain bertitik.
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
USERNAME_PATTERN = r"^[a-zA-Z0-9_.-]+$"
PASSWORD_MIN_LENGTH = 8


class UserCreate(BaseModel):
    """Payload admin untuk membuat akun baru."""
    username: str = Field(..., min_length=3, max_length=50, pattern=USERNAME_PATTERN)
    email: str = Field(..., max_length=255, pattern=EMAIL_PATTERN)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole
    password: str = Field(..., min_length=PASSWORD_MIN_LENGTH, max_length=72)


class UserUpdate(BaseModel):
    """
    Payload admin untuk memperbarui akun (PUT — field profil wajib dikirim lengkap).
    `password` opsional: diisi hanya bila admin me-reset password user.
    Username sengaja tidak bisa diubah (identitas login & jejak audit).
    """
    email: str = Field(..., max_length=255, pattern=EMAIL_PATTERN)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole
    is_active: bool
    password: str | None = Field(default=None, min_length=PASSWORD_MIN_LENGTH, max_length=72)


class UserListResponse(BaseModel):
    """Respons paginasi daftar user."""
    items: list[UserResponse]
    total: int
    limit: int
    offset: int


class TokenPayload(BaseModel):
    """Struktur claims di dalam decoded JWT token."""
    sub: str
    role: UserRole
    exp: int
