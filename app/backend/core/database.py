"""
Dentify Backend — Database Engine & Session Factory
SQLAlchemy async engine terhubung ke PostgreSQL (dentify_db).
"""

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from core.config import settings


# ── Async Engine ────────────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url,
    echo=settings.DEBUG,       # log SQL queries saat DEBUG=True
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,        # cek koneksi sebelum pakai dari pool
)

# ── Session Factory ─────────────────────────────────────────────────
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Base class untuk semua ORM models ──────────────────────────────
class Base(DeclarativeBase):
    pass


# ── Dependency untuk FastAPI endpoints ──────────────────────────────
async def get_db() -> AsyncSession:
    """
    FastAPI dependency yang menyediakan database session.
    Otomatis commit jika tidak ada error, rollback jika ada exception.

    Usage di endpoint:
        async def my_endpoint(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Health Check Helper ─────────────────────────────────────────────
async def check_db_connection() -> bool:
    """
    Test koneksi ke database dengan query sederhana.
    Return True jika berhasil, raise exception jika gagal.
    """
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))
    return True
