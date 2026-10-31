"""
Dentify Backend — Seed Dummy Embeddings
Mengisi tabel `embeddings` dengan vektor dummy 512-dim untuk menguji matching
(similarity search pgvector) selama AI microservice belum bisa dipakai live.

- Hanya subjek aktif (is_deleted = FALSE) yang diisi.
- Embedding dari AI asli (model_version selain DUMMY_MODEL_VERSION) TIDAK ditimpa.
- Vektor AM: acak ternormalisasi L2, deterministik per subject ID (hasil stabil
  walau script dijalankan ulang).
- Vektor PM ke-i (urut created_at) sengaja dibuat "dekat" dengan AM ke-(i mod jumlah AM)
  dengan tingkat noise bergiliran, sehingga urutan kandidat matching bisa diverifikasi
  dan confidence-nya bervariasi (~98% / ~86% / ~71%).

Jalankan dari direktori app/backend/:
    python scripts/seed_embeddings.py           # isi / perbarui embedding dummy
    python scripts/seed_embeddings.py --clear   # hapus seluruh embedding dummy
"""

import argparse
import asyncio
import math
import random
import sys
from pathlib import Path

# Pastikan app/backend ada di sys.path
CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete, select

import models  # noqa: F401 — registrasi seluruh relasi ORM
from core.database import async_session_factory
from models.embedding import Embedding
from models.subject import Subject

DUMMY_MODEL_VERSION = "dummy_seed_v1"
VECTOR_DIM = 512
# Skala noise terhadap vektor AM pasangan → cosine ≈ 1/sqrt(1 + s²)
NOISE_LEVELS = (0.2, 0.6, 1.0)


def normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def random_unit_vector(seed: int) -> list[float]:
    rng = random.Random(seed)
    return normalize([rng.gauss(0.0, 1.0) for _ in range(VECTOR_DIM)])


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(normalize(a), normalize(b)))


def label(subject: Subject) -> str:
    return subject.full_name or subject.case_reference or str(subject.id)


async def clear_dummy_embeddings() -> None:
    async with async_session_factory() as session:
        result = await session.execute(
            delete(Embedding).where(Embedding.model_version == DUMMY_MODEL_VERSION)
        )
        await session.commit()
    print(f"[SUCCESS] {result.rowcount} embedding dummy ('{DUMMY_MODEL_VERSION}') dihapus.")


async def seed_embeddings() -> None:
    async with async_session_factory() as session:
        subjects = (
            await session.execute(
                select(Subject).where(Subject.is_deleted == False).order_by(Subject.created_at)
            )
        ).scalars().all()
        existing = {
            e.subject_id: e
            for e in (await session.execute(select(Embedding))).scalars().all()
        }

        ams = [s for s in subjects if s.subject_type == "ante_mortem"]
        pms = [s for s in subjects if s.subject_type == "post_mortem"]
        vectors: dict = {}
        seeded = skipped = 0

        def upsert(subject: Subject, vector: list[float]) -> None:
            nonlocal seeded
            emb = existing.get(subject.id)
            if emb:
                emb.vector = vector
            else:
                session.add(
                    Embedding(subject_id=subject.id, vector=vector, model_version=DUMMY_MODEL_VERSION)
                )
            seeded += 1

        def is_real(subject: Subject) -> bool:
            emb = existing.get(subject.id)
            return emb is not None and emb.model_version != DUMMY_MODEL_VERSION

        print(f"[INFO] Subjek aktif: {len(ams)} AM, {len(pms)} PM")

        for am in ams:
            if is_real(am):
                vectors[am.id] = [float(v) for v in existing[am.id].vector]
                skipped += 1
                continue
            vectors[am.id] = random_unit_vector(am.id.int)
            upsert(am, vectors[am.id])

        print("-" * 72)
        for i, pm in enumerate(pms):
            if is_real(pm):
                skipped += 1
                print(f"  PM {label(pm)!r}: dilewati (embedding AI asli)")
                continue
            if not ams:
                upsert(pm, random_unit_vector(pm.id.int))
                print(f"  PM {label(pm)!r}: acak (belum ada subjek AM)")
                continue

            target = ams[i % len(ams)]
            noise = random_unit_vector(pm.id.int)
            scale = NOISE_LEVELS[i % len(NOISE_LEVELS)]
            vector = normalize([a + scale * n for a, n in zip(vectors[target.id], noise)])
            upsert(pm, vector)
            print(
                f"  PM {label(pm)!r} -> dekat dengan AM {label(target)!r} "
                f"(cosine ~ {cosine(vector, vectors[target.id]):.3f})"
            )
        print("-" * 72)

        await session.commit()

    print(
        f"[SUCCESS] {seeded} embedding dummy diisi/diperbarui "
        f"(model_version='{DUMMY_MODEL_VERSION}'), {skipped} embedding AI asli dilewati."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed embedding dummy untuk uji matching.")
    parser.add_argument("--clear", action="store_true", help="Hapus seluruh embedding dummy")
    args = parser.parse_args()
    asyncio.run(clear_dummy_embeddings() if args.clear else seed_embeddings())
