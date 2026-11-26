"""
Dentify Services — Subject Embedding (gabungan 3 sudut citra)

AI service menghasilkan `subject_embedding` 512-dim PER CITRA (depan/kiri/kanan),
sedangkan tabel `embeddings` menyimpan 1 vektor per subjek untuk matching (pgvector).
Vektor subjek = rata-rata elemen-per-elemen dari embedding terbaru tiap citra aktif
subjek tersebut, lalu dinormalisasi L2 (cosine similarity tetap bermakna).

Sekaligus menyinkronkan `view_embeddings` (1 vektor per citra/sudut) yang dipakai
pencocokan per sudut (services/view_matching.py) — vektor rata-rata subjek di tabel
`embeddings` tetap disimpan, tetapi tidak lagi dipakai untuk peringkat kandidat.

Dihitung ulang setiap kali:
- job inferensi sebuah citra selesai (`api/v1/inference.py`)
- citra di-soft-delete (`api/v1/dental_images.py`) — embedding citra itu tidak dipakai lagi

Sumber data = `inference_jobs.result_payload` job `completed` terbaru per citra, sehingga
hasilnya tidak bergantung pada urutan selesai job dan tidak butuh perubahan skema DB.

Pemanggil WAJIB sudah mengunci row subjek (`SELECT ... FOR UPDATE`) dalam transaksi yang
sama agar penghitungan ulang dari beberapa job paralel tidak saling menimpa.
"""

import math
from datetime import datetime
from typing import Any, Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.dental_image import DentalImage
from models.embedding import Embedding
from models.inference_job import InferenceJob
from models.view_embedding import ViewEmbedding
from services.inference_status import applied_job_condition

EMBEDDING_DIM = 512
MODEL_VERSION_MAX_LEN = 50  # embeddings.model_version VARCHAR(50)
DEFAULT_MODEL_NAME = "ai_engine"


def is_valid_vector(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == EMBEDDING_DIM
        and all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in value)
    )


def mean_embedding(vectors: Sequence[Sequence[float]]) -> list[float] | None:
    """Rata-rata elemen-per-elemen lalu normalisasi L2. None bila kosong / norma nol."""
    if not vectors:
        return None
    n = len(vectors)
    mean = [sum(col) / n for col in zip(*vectors)]
    norm = math.sqrt(sum(x * x for x in mean))
    if norm == 0:
        return None
    return [x / norm for x in mean]


def model_version_label(model_names: Sequence[str | None], n_views: int) -> str:
    """Mis. 'resnet34-imagenet-d512/mean3' — model berbeda antar citra ditandai 'mixed'."""
    names = {m for m in model_names if m} or {DEFAULT_MODEL_NAME}
    base = names.pop() if len(names) == 1 else "mixed"
    suffix = f"/mean{n_views}"
    return base[: MODEL_VERSION_MAX_LEN - len(suffix)] + suffix


async def recompute_subject_embedding(session: AsyncSession, subject_id: UUID, now: datetime) -> Embedding | None:
    """
    Hitung ulang embedding subjek dari citra aktifnya. Bila tidak ada lagi citra aktif
    yang punya embedding valid, row `embeddings` subjek dihapus (subjek keluar dari
    kandidat matching sampai diproses AI lagi). Tidak commit — pemanggil yang commit.
    """
    await session.flush()  # perubahan job/citra di sesi ini ikut terbaca query di bawah

    latest_per_image = (
        select(
            InferenceJob.dental_image_id,
            DentalImage.view_type,
            InferenceJob.result_payload["subject_embedding"].label("vector"),
            InferenceJob.result_payload["subject_embedding_model"].astext.label("model"),
        )
        .join(DentalImage, DentalImage.id == InferenceJob.dental_image_id)
        .where(
            DentalImage.subject_id == subject_id,
            DentalImage.is_deleted == False,  # noqa: E712
            InferenceJob.status == "completed",
            applied_job_condition(),  # hasil analisis ulang yang belum dikonfirmasi tidak dipakai
            InferenceJob.result_payload["subject_embedding"].isnot(None),
        )
        .distinct(InferenceJob.dental_image_id)
        .order_by(InferenceJob.dental_image_id, InferenceJob.completed_at.desc().nulls_last())
    )
    rows = (await session.execute(latest_per_image)).all()
    valid_rows = [r for r in rows if is_valid_vector(r.vector)]
    valid = [(r.vector, r.model) for r in valid_rows]

    await _sync_view_embeddings(session, subject_id, valid_rows, now)

    existing = await session.scalar(select(Embedding).where(Embedding.subject_id == subject_id))
    vector = mean_embedding([v for v, _ in valid])

    if vector is None:
        if existing is not None:
            await session.delete(existing)
        return None

    label = model_version_label([m for _, m in valid], len(valid))
    if existing is not None:
        existing.vector = vector
        existing.model_version = label
        existing.generated_at = now
        return existing

    created = Embedding(subject_id=subject_id, vector=vector, model_version=label, generated_at=now)
    session.add(created)
    return created


async def _sync_view_embeddings(session: AsyncSession, subject_id: UUID, rows: Sequence[Any], now: datetime) -> None:
    """
    Samakan `view_embeddings` subjek dengan embedding terbaru tiap citra aktif (`rows` dari
    recompute_subject_embedding): tambah/perbarui yang ada, hapus milik citra yang sudah
    dihapus atau tidak lagi punya hasil AI yang berlaku. Dipakai pencocokan per sudut.
    """
    by_image = {r.dental_image_id: r for r in rows}
    existing = {
        ve.dental_image_id: ve
        for ve in (await session.scalars(select(ViewEmbedding).where(ViewEmbedding.subject_id == subject_id)))
    }
    for image_id, ve in existing.items():
        if image_id not in by_image:
            await session.delete(ve)
    for image_id, r in by_image.items():
        model = (r.model or DEFAULT_MODEL_NAME)[:MODEL_VERSION_MAX_LEN]
        ve = existing.get(image_id)
        if ve is None:
            session.add(ViewEmbedding(
                dental_image_id=image_id, subject_id=subject_id, view_type=r.view_type,
                vector=r.vector, model_version=model, generated_at=now,
            ))
        else:
            ve.view_type = r.view_type
            ve.vector = r.vector
            ve.model_version = model
            ve.generated_at = now
