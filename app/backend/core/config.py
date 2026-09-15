"""
Dentify Backend — Application Configuration
Membaca environment variables dari .env menggunakan Pydantic Settings.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Konfigurasi aplikasi Dentify.
    Semua nilai dibaca dari file .env di folder app/backend/.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── PostgreSQL ──────────────────────────────────────────────────
    POSTGRES_USER: str = "dentify_admin"
    POSTGRES_PASSWORD: str = "dentify_local_dev"
    POSTGRES_DB: str = "dentify_db"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432

    @property
    def database_url(self) -> str:
        """Async connection string untuk SQLAlchemy (asyncpg driver)."""
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def database_url_sync(self) -> str:
        """Sync connection string (untuk Alembic atau utility scripts)."""
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # ── MinIO ───────────────────────────────────────────────────────
    MINIO_ROOT_USER: str = "minioadmin"
    MINIO_ROOT_PASSWORD: str = "minioadmin_local_dev"
    MINIO_HOST: str = "localhost"
    MINIO_API_PORT: int = 9000
    MINIO_CONSOLE_PORT: int = 9001
    MINIO_BUCKET_NAME: str = "dentify-intraoral-images"

    @property
    def minio_endpoint(self) -> str:
        return f"{self.MINIO_HOST}:{self.MINIO_API_PORT}"

    # ── ChromaDB ────────────────────────────────────────────────────
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8000

    @property
    def chroma_url(self) -> str:
        return f"http://{self.CHROMA_HOST}:{self.CHROMA_PORT}"

    # ── JWT (placeholder — diimplementasi di task berikutnya) ──────
    JWT_SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # ── Application ─────────────────────────────────────────────────
    APP_NAME: str = "Dentify API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True


# Singleton instance — import ini dari mana saja
settings = Settings()
