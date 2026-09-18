"""
Dentify API v1 — Dental Images Endpoints
Manajemen citra klinis intraoral gigi: upload ke MinIO, penyimpanan metadata & hash SHA-256,
pengambilan metadata dengan presigned URL aman, serta soft-delete data forensik.
Role akses:
- Admin & Examiner: Upload (POST), Soft-delete (DELETE)
- Semua role (termasuk Viewer): GET detail citra, GET list citra per subjek
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user, require_role
from models.dental_image import DentalImage
from models.subject import Subject
from models.user import User
from schemas.dental_image import (
    DentalImageListResponse,
    DentalImageResponse,
    ViewType,
)
from services.storage_service import storage_service

router = APIRouter(tags=["Dental Images"])

# MIME types citra yang diizinkan
ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}


@router.post(
    "/dental-images/upload",
    response_model=DentalImageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Dental Image",
    description=(
        "Upload citra intraoral (multipart/form-data), simpan fisik ke MinIO, "
        "kalkulasi hash SHA-256 untuk chain-of-custody forensik, dan simpan metadata ke DB. "
        "Hanya untuk role admin dan examiner."
    ),
)
async def upload_dental_image(
    request: Request,
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    subject_id: UUID = Form(..., description="ID subjek pemilik citra"),
    view_type: ViewType = Form(..., description="Sudut pandang: 'depan', 'kiri', atau 'kanan'"),
    file: UploadFile = File(..., description="Berkas citra intraoral (JPEG/PNG/WebP)"),
    device_id: str | None = Form(None, description="Identifier perangkat scanner (opsional)"),
    captured_at: datetime | None = Form(None, description="Waktu pengambilan citra (ISO 8601, opsional)"),
) -> DentalImageResponse:
    """Upload citra intraoral ke MinIO dan rekam metadata ke database."""

    # 1. Validasi keberadaan subjek (dan tidak sedang di-soft-delete)
    sub_stmt = select(Subject).where(Subject.id == subject_id, Subject.is_deleted == False)
    sub_res = await db.execute(sub_stmt)
    subject = sub_res.scalar_one_or_none()
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subjek dengan ID '{subject_id}' tidak ditemukan atau telah dihapus",
        )

    # 2. Validasi tipe konten berkas
    content_type = file.content_type or ""
    if content_type.lower() not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Format file '{content_type}' tidak didukung. "
                "Harap unggah gambar bertipe JPEG, PNG, atau WebP."
            ),
        )

    # 3. Validasi constraint unik (subject_id, view_type)
    # Satu subjek hanya boleh memiliki 1 citra aktif per sudut pandang (depan/kiri/kanan)
    img_stmt = select(DentalImage).where(
        DentalImage.subject_id == subject_id,
        DentalImage.view_type == view_type,
        DentalImage.is_deleted == False,
    )
    img_res = await db.execute(img_stmt)
    existing_img = img_res.scalar_one_or_none()
    if existing_img:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Citra intraoral untuk subjek ini dengan sudut pandang '{view_type}' sudah ada. "
                "Hapus citra lama terlebih dahulu jika ingin mengganti."
            ),
        )

    # 4. Baca konten berkas dan kalkulasi hash SHA-256
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Berkas citra yang diunggah kosong",
        )

    file_hash = storage_service.calculate_sha256(file_bytes)

    # Tentukan ekstensi berkas
    filename = file.filename or "image.jpg"
    _, ext = os.path.splitext(filename)
    if not ext:
        ext = ".jpg" if "jpeg" in content_type else ".png" if "png" in content_type else ".webp"

    # Nama objek di MinIO: subjects/{subject_id}/{view_type}_{short_id}{ext}
    unique_suffix = uuid.uuid4().hex[:8]
    object_name = f"subjects/{subject_id}/{view_type}_{unique_suffix}{ext}"

    # 5. Simpan file ke MinIO via storage_service
    storage_service.upload_image(
        file_data=file_bytes,
        object_name=object_name,
        content_type=content_type,
    )

    # 6. Simpan metadata ke tabel dental_images
    now = datetime.now(timezone.utc)
    dental_image = DentalImage(
        subject_id=subject_id,
        view_type=view_type,
        file_path=object_name,
        file_hash=file_hash,
        device_id=device_id,
        preprocessing_status="raw",
        captured_at=captured_at,
        uploaded_at=now,
        is_deleted=False,
    )

    db.add(dental_image)
    try:
        await db.commit()
        await db.refresh(dental_image)
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Gagal menyimpan citra: constraint unik sudut pandang '{view_type}' "
                "untuk subjek ini terlanggar."
            ),
        ) from e

    # 7. Generate presigned URL sementara untuk respon
    presigned_url = storage_service.get_presigned_url(dental_image.file_path)

    # Metadata audit log
    request.state.audit_action = "UPLOAD_DENTAL_IMAGE"
    request.state.resource_type = "dental_images"
    request.state.resource_id = dental_image.id

    response_model = DentalImageResponse.model_validate(dental_image)
    response_model.image_url = presigned_url
    return response_model


@router.get(
    "/dental-images/{id}",
    response_model=DentalImageResponse,
    summary="Get Dental Image Detail",
    description=(
        "Mendapatkan metadata citra gigi dan presigned URL dari MinIO. "
        "Object key dan bucket mentah tidak pernah diekspos ke client."
    ),
)
async def get_dental_image(
    id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DentalImageResponse:
    """Ambil detail citra dan presigned URL berbatas waktu."""
    stmt = select(DentalImage).where(DentalImage.id == id, DentalImage.is_deleted == False)
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Citra gigi tidak ditemukan atau telah dihapus",
        )

    presigned_url = storage_service.get_presigned_url(image.file_path)

    request.state.resource_id = image.id

    response_data = DentalImageResponse.model_validate(image)
    response_data.image_url = presigned_url
    return response_data


@router.delete(
    "/dental-images/{id}",
    response_model=DentalImageResponse,
    summary="Delete Dental Image (Soft Delete)",
    description=(
        "Menghapus citra gigi secara soft-delete (set is_deleted=TRUE, deleted_at, deleted_by). "
        "File di MinIO dan row DB TIDAK dihapus fisik demi integritas chain-of-custody forensik. "
        "Hanya untuk role admin dan examiner."
    ),
)
async def delete_dental_image(
    id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(require_role(["admin", "examiner"]))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DentalImageResponse:
    """Soft-delete citra intraoral."""
    stmt = select(DentalImage).where(DentalImage.id == id, DentalImage.is_deleted == False)
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Citra gigi tidak ditemukan atau telah dihapus",
        )

    now = datetime.now(timezone.utc)
    image.is_deleted = True
    image.deleted_at = now
    image.deleted_by = current_user.id

    await db.commit()
    await db.refresh(image)

    request.state.audit_action = "DELETE_DENTAL_IMAGE"
    request.state.resource_type = "dental_images"
    request.state.resource_id = image.id

    return DentalImageResponse.model_validate(image)


@router.get(
    "/subjects/{id}/images",
    response_model=DentalImageListResponse,
    summary="List Images by Subject",
    description="Mendapatkan seluruh citra klinis aktif milik satu subjek, lengkap dengan presigned URL.",
)
async def get_subject_images(
    id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DentalImageListResponse:
    """Ambil daftar semua citra aktif milik subjek tertentu."""
    # Pastikan subjek ada dan tidak di-soft delete
    sub_stmt = select(Subject).where(Subject.id == id, Subject.is_deleted == False)
    sub_res = await db.execute(sub_stmt)
    subject = sub_res.scalar_one_or_none()
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subjek dengan ID '{id}' tidak ditemukan atau telah dihapus",
        )

    # Ambil citra aktif milik subjek
    stmt = (
        select(DentalImage)
        .where(DentalImage.subject_id == id, DentalImage.is_deleted == False)
        .order_by(DentalImage.uploaded_at.asc())
    )
    result = await db.execute(stmt)
    images = list(result.scalars().all())

    items: list[DentalImageResponse] = []
    for img in images:
        item = DentalImageResponse.model_validate(img)
        item.image_url = storage_service.get_presigned_url(img.file_path)
        items.append(item)

    request.state.resource_id = subject.id

    return DentalImageListResponse(
        items=items,
        total=len(items),
    )
