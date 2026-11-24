"""
Dentify API v1 — Device Captures (Inbox foto dari alat ESP32)

Alur:
1. Alat  : POST /device/captures (X-Device-Key) → foto disimpan ke MinIO device-inbox/,
           dicatat 'pending' (belum punya subjek).
2. Web   : GET  /device-captures                 → isi Inbox
           GET  /device-captures/{id}/file       → isi foto (same-origin, untuk kotak preview)
           GET  /device-captures/assignable-subjects → subjek yang citranya belum lengkap
           POST /device-captures/{id}/assign     → menjadi dental_images biasa ('assigned')
           DELETE /device-captures/{id}          → soft delete ('discarded'), file tetap di MinIO

Role akses web: admin & examiner. Subjek ante-mortem hanya bisa diisi admin
(aturan yang sama dengan upload manual).
"""

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
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import ensure_can_modify_subject_type, require_role
from models.dental_image import DentalImage
from models.device import Device, DeviceCapture
from models.subject import Subject
from models.user import User
from schemas.dental_image import DentalImageResponse, ViewType
from schemas.device_capture import (
    AssignableSubject,
    AssignableSubjectListResponse,
    CaptureStatus,
    DeviceCaptureAssignRequest,
    DeviceCaptureIngestResponse,
    DeviceCaptureListResponse,
    DeviceCaptureResponse,
)
from services.dental_image_service import (
    add_dental_image,
    build_object_name,
    ensure_view_free,
    get_active_subject,
)
from services.device_service import get_current_device
from services.storage_service import storage_service

router = APIRouter(tags=["Device Captures"])

MAX_CAPTURE_BYTES = 20 * 1024 * 1024
ALLOWED_CAPTURE_TYPES = {"image/jpeg", "image/jpg", "application/octet-stream"}
INBOX_ROLES = ["admin", "examiner"]
ALL_VIEWS = ("depan", "kiri", "kanan")


def _capture_response(capture: DeviceCapture, device: Device, with_url: bool = True) -> DeviceCaptureResponse:
    image_url = None
    if with_url:
        try:
            image_url = storage_service.get_presigned_url(capture.file_path)
        except RuntimeError:
            image_url = None
    return DeviceCaptureResponse(
        id=capture.id,
        device_code=device.device_code,
        device_name=device.name,
        file_hash=capture.file_hash,
        file_size=capture.file_size,
        original_filename=capture.original_filename,
        view_type_hint=capture.view_type_hint,
        captured_at=capture.captured_at,
        received_at=capture.received_at,
        status=capture.status,
        dental_image_id=capture.dental_image_id,
        assigned_at=capture.assigned_at,
        deleted_at=capture.deleted_at,
        image_url=image_url,
    )


async def _get_capture_or_404(db: AsyncSession, capture_id: UUID, *, lock: bool = False) -> DeviceCapture:
    stmt = select(DeviceCapture).where(DeviceCapture.id == capture_id)
    if lock:
        stmt = stmt.with_for_update()
    capture = (await db.execute(stmt)).scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto tidak ditemukan di Inbox")
    return capture


def _ensure_pending(capture: DeviceCapture) -> None:
    if capture.status == "assigned":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Foto ini sudah dipasangkan ke subjek (mungkin oleh pengguna lain). Muat ulang Inbox.",
        )
    if capture.status == "discarded":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Foto ini sudah dihapus dari Inbox. Muat ulang Inbox.",
        )


# ── 1. Endpoint ALAT ────────────────────────────────────────────────────


@router.post(
    "/device/captures",
    response_model=DeviceCaptureIngestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Receive Device Capture (alat ESP32)",
    description=(
        "Dipanggil alat, bukan browser. Header `X-Device-Key` wajib. Multipart: `file` (JPEG), "
        "`sha256` (hex, dicocokkan dengan isi file), `device_id` (opsional, harus = device_code), "
        "`captured_at` (ISO 8601, opsional), `view_type` (opsional, petunjuk sudut). "
        "Foto masuk Inbox berstatus 'pending'."
    ),
)
async def receive_device_capture(
    request: Request,
    device: Annotated[Device, Depends(get_current_device)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(..., description="Foto JPEG dari alat"),
    sha256: str = Form(..., description="SHA-256 isi file (hex 64 karakter) yang dihitung alat"),
    device_id: str | None = Form(None, description="device_code alat (opsional, dicocokkan dengan key)"),
    captured_at: datetime | None = Form(None, description="Waktu pengambilan menurut jam alat"),
    view_type: ViewType | None = Form(None, description="Petunjuk sudut dari alat (opsional)"),
) -> DeviceCaptureIngestResponse:
    if device_id and device_id != device.device_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"device_id '{device_id}' tidak sesuai dengan X-Device-Key (terdaftar sebagai '{device.device_code}')",
        )

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_CAPTURE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Content-Type '{content_type}' tidak didukung (harus image/jpeg)",
        )

    data = await file.read(MAX_CAPTURE_BYTES + 1)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File kosong")
    if len(data) > MAX_CAPTURE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File melebihi 20 MB")
    if data[:3] != b"\xff\xd8\xff":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Isi file bukan JPEG")

    actual_hash = storage_service.calculate_sha256(data)
    claimed_hash = sha256.strip().lower()
    if actual_hash != claimed_hash:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"SHA-256 tidak cocok: alat={claimed_hash} server={actual_hash} "
                "(file rusak/terpotong saat transfer)"
            ),
        )

    now = datetime.now(timezone.utc)
    capture_id = uuid.uuid4()
    object_name = f"device-inbox/{device.device_code}/{now:%Y%m%d_%H%M%S}_{capture_id.hex[:8]}.jpg"
    storage_service.upload_image(file_data=data, object_name=object_name, content_type="image/jpeg")

    capture = DeviceCapture(
        id=capture_id,
        device_id=device.id,
        file_path=object_name,
        file_hash=actual_hash,
        file_size=len(data),
        original_filename=(file.filename or None),
        view_type_hint=view_type,
        captured_at=captured_at,
        received_at=now,
        status="pending",
    )
    db.add(capture)
    device.last_seen_at = now
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        storage_service.remove_object(object_name)
        raise

    request.state.audit_action = "DEVICE_CAPTURE_RECEIVED"
    request.state.resource_type = "device_captures"
    request.state.resource_id = capture_id
    request.state.audit_details = {"device_code": device.device_code, "file_hash": actual_hash, "size": len(data)}

    return DeviceCaptureIngestResponse(
        capture_id=capture_id,
        device_id=device.device_code,
        sha256=actual_hash,
        size=len(data),
        captured_at=captured_at,
        received_at=now,
        status="pending",
    )


# ── 2. Endpoint WEB (Inbox) ─────────────────────────────────────────────


@router.get(
    "/device-captures",
    response_model=DeviceCaptureListResponse,
    summary="List Inbox Captures",
    description="Isi Inbox, terbaru dulu. Default hanya status 'pending'. Role: admin & examiner.",
)
async def list_device_captures(
    current_user: Annotated[User, Depends(require_role(INBOX_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
    capture_status: CaptureStatus = Query("pending", alias="status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> DeviceCaptureListResponse:
    where = DeviceCapture.status == capture_status
    total = (await db.execute(select(func.count()).select_from(DeviceCapture).where(where))).scalar_one()
    rows = (
        await db.execute(
            select(DeviceCapture, Device)
            .join(Device, Device.id == DeviceCapture.device_id)
            .where(where)
            .order_by(DeviceCapture.received_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return DeviceCaptureListResponse(
        items=[_capture_response(c, d) for c, d in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/device-captures/assignable-subjects",
    response_model=AssignableSubjectListResponse,
    summary="Subjects With Incomplete Images",
    description=(
        "Subjek aktif yang citranya belum lengkap (< 3 sudut), untuk dialog 'Pasangkan'. "
        "Subjek ante-mortem hanya ditampilkan untuk admin. `q` (min. 2 karakter) mencari nama, "
        "referensi kasus, atau awalan ID."
    ),
)
async def list_assignable_subjects(
    current_user: Annotated[User, Depends(require_role(INBOX_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str | None = Query(None, max_length=100),
    subject_type: str | None = Query(None, pattern="^(ante_mortem|post_mortem)$"),
    limit: int = Query(20, ge=1, le=50),
) -> AssignableSubjectListResponse:
    views_sq = (
        select(
            DentalImage.subject_id.label("subject_id"),
            func.array_agg(cast(DentalImage.view_type, String)).label("views"),
            func.count().label("n"),
        )
        .where(DentalImage.is_deleted == False)
        .group_by(DentalImage.subject_id)
        .subquery()
    )

    filters = [Subject.is_deleted == False, func.coalesce(views_sq.c.n, 0) < len(ALL_VIEWS)]
    if current_user.role != "admin":
        filters.append(Subject.subject_type == "post_mortem")
    if subject_type:
        filters.append(Subject.subject_type == subject_type)
    if q is not None and q.strip():
        term = q.strip()
        if len(term) < 2:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Kata kunci minimal 2 karakter")
        escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        filters.append(
            or_(
                Subject.full_name.ilike(f"%{escaped}%", escape="\\"),
                Subject.case_reference.ilike(f"%{escaped}%", escape="\\"),
                cast(Subject.id, String).like(f"{escaped.lower()}%", escape="\\"),
            )
        )

    base = select(Subject, views_sq.c.views).outerjoin(views_sq, views_sq.c.subject_id == Subject.id).where(*filters)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.order_by(Subject.created_at.desc()).limit(limit))).all()

    items = [
        AssignableSubject(
            id=s.id,
            subject_type=s.subject_type,
            full_name=s.full_name,
            case_reference=s.case_reference,
            created_at=s.created_at,
            filled_views=[v for v in ALL_VIEWS if v in (views or [])],
        )
        for s, views in rows
    ]
    return AssignableSubjectListResponse(items=items, total=total)


@router.get(
    "/device-captures/{capture_id}/file",
    summary="Download Inbox Capture",
    description="Isi JPEG foto Inbox lewat backend (same-origin) — dipakai untuk mengisi kotak preview upload.",
    responses={200: {"content": {"image/jpeg": {}}}},
)
async def download_device_capture(
    capture_id: UUID,
    current_user: Annotated[User, Depends(require_role(INBOX_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    capture = await _get_capture_or_404(db, capture_id)
    try:
        data = storage_service.get_object_bytes(capture.file_path)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="File foto tidak dapat diambil dari storage") from e
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=300", "X-Content-SHA256": capture.file_hash},
    )


@router.post(
    "/device-captures/{capture_id}/assign",
    response_model=DentalImageResponse,
    summary="Assign Inbox Capture To Subject",
    description=(
        "Pasangkan foto Inbox ke subjek + sudut: objek disalin di MinIO ke subjects/{id}/..., dibuat baris "
        "dental_images (hash, device_id, captured_at dari alat), capture menjadi 'assigned'. "
        "404 subjek tidak ada, 403 subjek AM oleh non-admin, 409 sudut sudah terisi / foto sudah "
        "dipasangkan atau dihapus."
    ),
)
async def assign_device_capture(
    capture_id: UUID,
    payload: DeviceCaptureAssignRequest,
    request: Request,
    current_user: Annotated[User, Depends(require_role(INBOX_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DentalImageResponse:
    # Kunci baris capture: dua pengguna yang memasangkan foto yang sama → yang kedua 409
    capture = await _get_capture_or_404(db, capture_id, lock=True)
    _ensure_pending(capture)

    subject = await get_active_subject(db, payload.subject_id)
    ensure_can_modify_subject_type(current_user, subject.subject_type)
    await ensure_view_free(db, subject.id, payload.view_type)

    device = await db.get(Device, capture.device_id)
    object_name = build_object_name(subject.id, payload.view_type, ".jpg")
    storage_service.copy_object(capture.file_path, object_name)

    try:
        image = await add_dental_image(
            db,
            subject_id=subject.id,
            view_type=payload.view_type,
            file_path=object_name,
            file_hash=capture.file_hash,
            device_id=device.device_code if device else None,
            captured_at=capture.captured_at,
        )
        capture.status = "assigned"
        capture.dental_image_id = image.id
        capture.assigned_by = current_user.id
        capture.assigned_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception:
        storage_service.remove_object(object_name)
        raise

    await db.refresh(image)

    request.state.audit_action = "ASSIGN_DEVICE_CAPTURE"
    request.state.resource_type = "device_captures"
    request.state.resource_id = capture.id
    request.state.audit_details = {
        "dental_image_id": str(image.id),
        "subject_id": str(subject.id),
        "view_type": payload.view_type,
        "file_hash": capture.file_hash,
    }

    response = DentalImageResponse.model_validate(image)
    response.image_url = storage_service.get_presigned_url(image.file_path)
    return response


@router.delete(
    "/device-captures/{capture_id}",
    response_model=DeviceCaptureResponse,
    summary="Discard Inbox Capture (Soft Delete)",
    description="Hapus foto dari Inbox: status 'discarded', file tetap di MinIO & tercatat di audit. 409 bila sudah dipasangkan.",
)
async def discard_device_capture(
    capture_id: UUID,
    request: Request,
    current_user: Annotated[User, Depends(require_role(INBOX_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DeviceCaptureResponse:
    capture = await _get_capture_or_404(db, capture_id, lock=True)
    _ensure_pending(capture)

    capture.status = "discarded"
    capture.deleted_by = current_user.id
    capture.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(capture)
    device = await db.get(Device, capture.device_id)

    request.state.audit_action = "DISCARD_DEVICE_CAPTURE"
    request.state.resource_type = "device_captures"
    request.state.resource_id = capture.id
    request.state.audit_details = {"file_hash": capture.file_hash}

    return _capture_response(capture, device, with_url=False)
