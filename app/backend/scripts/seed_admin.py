"""
Dentify Backend — Seed Admin User
Script mandiri untuk membuat akun Administrator pertama kali.
Jalankan dari direktori app/backend/:
    python scripts/seed_admin.py
"""

import asyncio
import os
import sys
from pathlib import Path

# Pastikan app/backend ada di sys.path
CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select

from core.database import async_session_factory
from core.security import hash_password
from models.user import User

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_EMAIL = "admin@dentify.local"
DEFAULT_ADMIN_FULLNAME = "Administrator Dentify"


async def seed_admin():
    admin_password = os.environ.get("SEED_ADMIN_PASSWORD")
    if not admin_password:
        admin_password = "admin123"
        print("=" * 72)
        print("[WARNING] SEED_ADMIN_PASSWORD tidak diatur di environment variable!")
        print("[WARNING] Menggunakan password default: 'admin123'")
        print("[WARNING] HARAP SEGERA GANTI PASSWORD INI DI LINGKUNGAN PRODUKSI/SERVER!")
        print("=" * 72)
    else:
        print("[INFO] Membaca SEED_ADMIN_PASSWORD dari environment variable.")

    async with async_session_factory() as session:
        # Cek apakah user admin sudah ada
        stmt = select(User).where(User.username == DEFAULT_ADMIN_USERNAME)
        result = await session.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print(
                f"[INFO] User '{DEFAULT_ADMIN_USERNAME}' sudah ada di database "
                f"(ID: {existing_user.id})."
            )
            print("[INFO] Tidak ada perubahan yang dilakukan.")
            return

        # Buat user admin baru
        hashed_pwd = hash_password(admin_password)
        new_admin = User(
            username=DEFAULT_ADMIN_USERNAME,
            email=DEFAULT_ADMIN_EMAIL,
            password_hash=hashed_pwd,
            role="admin",
            full_name=DEFAULT_ADMIN_FULLNAME,
            is_active=True,
        )

        session.add(new_admin)
        await session.commit()
        await session.refresh(new_admin)

        print("-" * 50)
        print("[SUCCESS] User admin berhasil dibuat!")
        print(f"  ID       : {new_admin.id}")
        print(f"  Username : {new_admin.username}")
        print(f"  Email    : {new_admin.email}")
        print(f"  Role     : {new_admin.role}")
        print(f"  Password : {admin_password}")
        print("-" * 50)


if __name__ == "__main__":
    asyncio.run(seed_admin())
