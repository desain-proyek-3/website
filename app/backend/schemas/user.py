"""
Dentify Schemas — User & Authentication
Pydantic models untuk request login, response token, dan user profile.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

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


class TokenPayload(BaseModel):
    """Struktur claims di dalam decoded JWT token."""
    sub: str
    role: UserRole
    exp: int
