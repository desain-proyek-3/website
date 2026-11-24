"""
Dentify Services — Dental Image
Logika bersama pembuatan citra intraoral (dental_images), dipakai oleh:
- POST /dental-images/upload          (upload manual dari browser)
- POST /device-captures/{id}/assign   (foto dari alat di Inbox dipasangkan ke subjek)
"""

import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models.dental_image import DentalImage
from models.subject import Subject


async def get_active_subject(db: AsyncSession, subject_id: UUID) -> Subject:
    """Subjek aktif (tidak di-soft-delete) atau 404."""
    res = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.is_deleted == False))
    subject = res.scalar_one_or_none()
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subjek dengan ID '{subject_id}' tidak ditemukan atau telah dihapus",
        )
    return subject


def _view_taken_error(view_type: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            f"Citra intraoral untuk subjek ini dengan sudut pandang '{view_type}' sudah ada. "
            "Hapus citra lama terlebih dahulu jika ingin mengganti."
        ),
    )


async def ensure_view_free(db: AsyncSession, subject_id: UUID, view_type: str) -> None:
    """Satu subjek hanya boleh memiliki 1 citra aktif per sudut pandang → 409 bila sudah terisi."""
    res = await db.execute(
        select(DentalImage.id).where(
            DentalImage.subject_id == subject_id,
            DentalImage.view_type == view_type,
            DentalImage.is_deleted == False,
        )
    )
    if res.scalar_one_or_none() is not None:
        raise _view_taken_error(view_type)


def build_object_name(subject_id: UUID, view_type: str, ext: str) -> str:
    """Nama objek MinIO: subjects/{subject_id}/{view_type}_{short_id}{ext}"""
    return f"subjects/{subject_id}/{view_type}_{uuid.uuid4().hex[:8]}{ext}"


async def add_dental_image(
    db: AsyncSession,
    *,
    subject_id: UUID,
    view_type: str,
    file_path: str,
    file_hash: str,
    device_id: str | None = None,
    captured_at: datetime | None = None,
) -> DentalImage:
    """
    Tambahkan baris dental_images (flush, BELUM commit — pemanggil yang commit agar bisa
    digabung dengan perubahan lain dalam satu transaksi). Pelanggaran constraint unik
    (subject_id, view_type) dari request paralel → rollback + 409.
    """
    image = DentalImage(
        subject_id=subject_id,
        view_type=view_type,
        file_path=file_path,
        file_hash=file_hash,
        device_id=device_id,
        preprocessing_status="raw",
        captured_at=captured_at,
        uploaded_at=datetime.now(timezone.utc),
        is_deleted=False,
    )
    db.add(image)
    try:
        await db.flush()
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Gagal menyimpan citra: constraint unik sudut pandang '{view_type}' "
                "untuk subjek ini terlanggar."
            ),
        ) from e
    return image
