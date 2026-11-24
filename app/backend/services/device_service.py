"""
Dentify Services — Device
Autentikasi alat (ESP32) lewat header X-Device-Key.
Key mentah hanya diketahui alat & dicetak sekali oleh scripts/create_device.py;
database menyimpan SHA-256-nya.
"""

import hashlib
import re
import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.device import Device

# device_code dipakai di nama objek MinIO → batasi karakternya
DEVICE_CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{3,100}$")


def hash_device_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def generate_device_key() -> str:
    """Key acak ~32 karakter URL-safe (24 byte entropi)."""
    return secrets.token_urlsafe(24)


async def get_current_device(
    db: Annotated[AsyncSession, Depends(get_db)],
    x_device_key: Annotated[str | None, Header(description="API key alat (dari scripts/create_device.py)")] = None,
) -> Device:
    """Dependency endpoint alat: 401 bila key kosong, salah, atau alat dinonaktifkan."""
    if not x_device_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Header X-Device-Key wajib diisi")
    res = await db.execute(
        select(Device).where(Device.api_key_hash == hash_device_key(x_device_key.strip()), Device.is_active == True)
    )
    device = res.scalar_one_or_none()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-Device-Key tidak valid atau alat dinonaktifkan",
        )
    return device
