"""
Dentify Services — Authentication Service
Logika bisnis autentikasi: verifikasi kredensial database dan generasi token.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.security import create_access_token, verify_password
from models.user import User
from schemas.user import TokenResponse


async def authenticate_user(
    db: AsyncSession,
    username: str,
    password: str,
) -> User | None:
    """
    Verifikasi username dan password pengguna ke database.
    Mengembalikan User instance jika cocok dan aktif, None jika gagal.
    """
    stmt = select(User).where(User.username == username)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        return None

    if not user.is_active:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user


def create_user_token(user: User) -> TokenResponse:
    """
    Generate JWT access token untuk user yang telah terverifikasi.
    """
    token_data = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
    }
    access_token = create_access_token(data=token_data)
    return TokenResponse(access_token=access_token, token_type="bearer")
