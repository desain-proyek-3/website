"""
Dentify Schemas — Subject
Pydantic models untuk data Subjek forensik (Ante-Mortem & Post-Mortem).
Validasi ketat sesuai ENUM subject_type_enum di schema_phase1.sql.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Sesuai tipe ENUM subject_type_enum di database
SubjectType = Literal["ante_mortem", "post_mortem"]


class SubjectBase(BaseModel):
    """Atribut dasar entitas subjek forensik."""
    subject_type: SubjectType = Field(
        ...,
        description="Jenis subjek forensik: 'ante_mortem' (AM) atau 'post_mortem' (PM)",
    )
    full_name: str | None = Field(
        default=None,
        max_length=255,
        description="Nama lengkap subjek (opsional, untuk PM dapat dikosongkan/unknown)",
    )
    case_reference: str | None = Field(
        default=None,
        max_length=100,
        description="Nomor referensi kasus atau nomor insiden bencana",
    )
    notes: str | None = Field(
        default=None,
        description="Catatan tambahan, riwayat medis gigi, atau keterangan fisik",
    )


class SubjectCreate(SubjectBase):
    """Payload untuk pembuatan data subjek baru."""
    pass


class SubjectUpdate(SubjectBase):
    """Payload untuk pembaharuan data subjek (PUT)."""
    pass


class SubjectResponse(SubjectBase):
    """Representasi respons lengkap data subjek forensik."""
    id: UUID
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    deleted_at: datetime | None = None
    deleted_by: UUID | None = None

    model_config = ConfigDict(from_attributes=True)


class SubjectListResponse(BaseModel):
    """Respons paginasi daftar subjek forensik."""
    items: list[SubjectResponse]
    total: int
    limit: int
    offset: int
