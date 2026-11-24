"""
Dentify Backend — Kelola Alat (ESP32) untuk Inbox
Mendaftarkan alat & membuat API key-nya. Key mentah DICETAK SEKALI — salin ke
DEVICE_KEY di firmware; database hanya menyimpan SHA-256-nya.

Jalankan dari app/backend/ (laptop):
    venv\\Scripts\\python scripts\\create_device.py --code dentify-cam-01 --name "Alat 1"
Di server (container backend):
    sudo docker exec -it dentify-backend python scripts/create_device.py --code dentify-cam-01 --name "Alat 1"

Opsi lain:
    --list                       daftar alat
    --code X --rotate            buat key baru (key lama langsung tidak berlaku)
    --code X --deactivate        nonaktifkan alat (upload ditolak 401)
    --code X --activate          aktifkan kembali
"""

import argparse
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

import models  # noqa: E402,F401 — registrasi seluruh relasi ORM
from core.database import async_session_factory, engine  # noqa: E402
from models.device import Device  # noqa: E402
from services.device_service import DEVICE_CODE_PATTERN, generate_device_key, hash_device_key  # noqa: E402


def print_key(device: Device, key: str) -> None:
    print("=" * 72)
    print(f"device_code : {device.device_code}")
    print(f"DEVICE_KEY  : {key}")
    print("Salin key ini ke firmware sekarang — key TIDAK disimpan dan tidak bisa ditampilkan lagi.")
    print("=" * 72)


async def main(args: argparse.Namespace) -> int:
    try:
        async with async_session_factory() as session:
            if args.list:
                devices = (await session.execute(select(Device).order_by(Device.created_at))).scalars().all()
                if not devices:
                    print("Belum ada alat terdaftar.")
                for d in devices:
                    state = "aktif" if d.is_active else "NONAKTIF"
                    print(f"{d.device_code:<24} {state:<9} last_seen={d.last_seen_at}  name={d.name or '-'}")
                return 0

            if not args.code or not DEVICE_CODE_PATTERN.match(args.code):
                print("--code wajib, 3-100 karakter: huruf, angka, '-' atau '_'")
                return 2

            device = (
                await session.execute(select(Device).where(Device.device_code == args.code))
            ).scalar_one_or_none()

            if args.deactivate or args.activate:
                if not device:
                    print(f"Alat '{args.code}' tidak ditemukan.")
                    return 1
                device.is_active = bool(args.activate)
                await session.commit()
                print(f"Alat '{args.code}' sekarang {'aktif' if device.is_active else 'NONAKTIF'}.")
                return 0

            key = generate_device_key()
            if device:
                if not args.rotate:
                    print(f"Alat '{args.code}' sudah terdaftar. Pakai --rotate untuk membuat key baru.")
                    return 1
                device.api_key_hash = hash_device_key(key)
                device.is_active = True
                if args.name:
                    device.name = args.name
                await session.commit()
                print("Key lama tidak berlaku lagi.")
                print_key(device, key)
                return 0

            device = Device(device_code=args.code, name=args.name, api_key_hash=hash_device_key(key), is_active=True)
            session.add(device)
            await session.commit()
            print(f"Alat '{args.code}' terdaftar.")
            print_key(device, key)
            return 0
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Kelola alat ESP32 untuk Inbox Dentify")
    parser.add_argument("--code", help="device_code, sama dengan DEVICE_ID di firmware (mis. dentify-cam-01)")
    parser.add_argument("--name", help="Nama/keterangan alat")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--list", action="store_true")
    group.add_argument("--rotate", action="store_true")
    group.add_argument("--deactivate", action="store_true")
    group.add_argument("--activate", action="store_true")
    sys.exit(asyncio.run(main(parser.parse_args())))
