"""
Dentify Tests — Embedding Subjek = Rata-rata 3 Sudut + view_type ke AI (Pekan 13)

AI service asli menghasilkan subject_embedding PER CITRA; backend menyimpan rata-rata
ternormalisasi embedding terbaru tiap citra aktif (services/subject_embedding.py).

Unit (tanpa server):
1. mean_embedding: rata-rata + normalisasi L2, kosong / norma nol → None
2. is_valid_vector & model_version_label

Live-server (127.0.0.1:8000) + MOCK AI (127.0.0.1:8100); di-skip bila mock tidak jalan:
3. 3 citra (depan/kiri/kanan) diproses → view_type terkirim (frontal/left/right), embedding
   subjek = rata-rata ternormalisasi 3 vektor hasil job, model_version '<model>/mean3'
4. Proses ulang 1 citra (force) → tetap mean3 (pakai job terbaru per citra, bukan menumpuk)
5. Soft-delete 1 citra → mean2 dari 2 citra tersisa; hapus semua → row embeddings hilang

Jalankan dari app/backend/ (backend + mock AI aktif):
    python -m unittest tests.test_subject_embedding -v
"""

import math
import time
import unittest
from uuid import UUID, uuid4

from sqlalchemy import select

from models.embedding import Embedding
from models.inference_job import InferenceJob
from services.subject_embedding import (
    EMBEDDING_DIM,
    is_valid_vector,
    mean_embedding,
    model_version_label,
)
from tests._support import (
    MOCK_AI_URL,
    create_subject,
    login,
    make_request,
    run_db,
    service_up,
    upload_image,
)

AI_VIEW = {"depan": "frontal", "kiri": "left", "kanan": "right"}


def _cos(a, b):
    return sum(x * y for x, y in zip(a, b)) / math.sqrt(sum(x * x for x in a) * sum(y * y for y in b))


class TestMeanEmbeddingUnit(unittest.TestCase):
    def test_01_mean_is_normalized_average(self):
        a = [1.0, 0.0] + [0.0] * (EMBEDDING_DIM - 2)
        b = [0.0, 1.0] + [0.0] * (EMBEDDING_DIM - 2)
        m = mean_embedding([a, b])
        self.assertAlmostEqual(m[0], 1 / math.sqrt(2))
        self.assertAlmostEqual(m[1], 1 / math.sqrt(2))
        self.assertAlmostEqual(math.sqrt(sum(x * x for x in m)), 1.0)
        self.assertEqual(mean_embedding([a]), a)
        self.assertIsNone(mean_embedding([]))
        self.assertIsNone(mean_embedding([a, [-x for x in a]]))  # saling meniadakan → norma 0

    def test_02_validation_and_label(self):
        self.assertTrue(is_valid_vector([0.1] * EMBEDDING_DIM))
        self.assertFalse(is_valid_vector([0.1] * 10))
        self.assertFalse(is_valid_vector(None))
        self.assertFalse(is_valid_vector([True] * EMBEDDING_DIM))
        self.assertFalse(is_valid_vector([float("nan")] * EMBEDDING_DIM))
        self.assertEqual(model_version_label(["resnet34-imagenet-d512"] * 3, 3), "resnet34-imagenet-d512/mean3")
        self.assertEqual(model_version_label(["a", "b"], 2), "mixed/mean2")
        self.assertEqual(model_version_label([None], 1), "ai_engine/mean1")
        self.assertLessEqual(len(model_version_label(["x" * 80], 3)), 50)


class TestSubjectEmbeddingLive(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not service_up(MOCK_AI_URL):
            raise unittest.SkipTest("Mock AI service tidak jalan di 127.0.0.1:8100 (scripts/mock_ai_service.py)")
        cls.admin = login("admin", "admin123")
        cls.pm = create_subject(cls.admin, "post_mortem", f"Tes Embedding PM {uuid4().hex[:6]}")
        cls.imgs = {v: upload_image(cls.admin, cls.pm, v)["id"] for v in ("depan", "kiri", "kanan")}

    @classmethod
    def tearDownClass(cls):
        make_request(f"/api/v1/subjects/{cls.pm}", method="DELETE", token=cls.admin)

    # ── helpers ──
    def run_batch(self, ids, force=False):
        status, res = make_request(
            "/api/v1/inference/batch", method="POST",
            data={"dental_image_ids": ids, "force": force}, token=self.admin,
        )
        self.assertEqual(status, 202, res)
        job_ids = [j["id"] for j in res["jobs"]]
        self.assertEqual(len(job_ids), len(ids), res)
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            jobs = [make_request(f"/api/v1/inference/jobs/{j}", token=self.admin)[1] for j in job_ids]
            if all(j["status"] in ("completed", "failed") for j in jobs):
                self.assertEqual([j["status"] for j in jobs], ["completed"] * len(jobs), jobs)
                return job_ids
            time.sleep(0.25)
        self.fail("Job belum selesai setelah 60 dtk")

    def latest_vectors(self):
        """Embedding job completed terbaru per citra aktif subjek — dihitung terpisah dari kode produksi."""
        async def op(session):
            jobs = (await session.execute(
                select(InferenceJob).where(
                    InferenceJob.subject_id == UUID(self.pm), InferenceJob.status == "completed"
                ).order_by(InferenceJob.completed_at)
            )).scalars().all()
            return {str(j.dental_image_id): j for j in jobs}  # yang terakhir menang
        return run_db(op)

    def stored_embedding(self):
        async def op(session):
            e = await session.scalar(select(Embedding).where(Embedding.subject_id == UUID(self.pm)))
            return (list(map(float, e.vector)), e.model_version) if e else None
        return run_db(op)

    def assert_embedding_is_mean_of(self, views):
        jobs = self.latest_vectors()
        vectors = [jobs[self.imgs[v]].result_payload["subject_embedding"] for v in views]
        n = len(vectors)
        mean = [sum(c) / n for c in zip(*vectors)]
        norm = math.sqrt(sum(x * x for x in mean))
        expected = [x / norm for x in mean]

        stored, version = self.stored_embedding()
        self.assertEqual(version, f"mock-resnet-d512/mean{n}")
        self.assertAlmostEqual(math.sqrt(sum(x * x for x in stored)), 1.0, places=4)
        for s, e in zip(stored, expected):
            self.assertAlmostEqual(s, e, places=5)
        return vectors, stored

    # ── tests ──
    def test_01_three_views_averaged_and_view_type_sent(self):
        self.run_batch(list(self.imgs.values()))
        jobs = self.latest_vectors()
        for view, img_id in self.imgs.items():
            job = jobs[img_id]
            self.assertEqual(job.request_payload["view_type"], view)
            self.assertEqual(job.result_payload["view_type"], AI_VIEW[view])  # mock menggemakan view_type

        vectors, stored = self.assert_embedding_is_mean_of(["depan", "kiri", "kanan"])
        # embedding per sudut berbeda (bukan disalin) tapi mirip; rata-rata lebih dekat ke tiap sudut
        self.assertLess(_cos(vectors[0], vectors[1]), 0.9999)
        for v in vectors:
            self.assertGreater(_cos(stored, v), 0.95)

    def test_02_reprocess_keeps_one_vector_per_image(self):
        self.run_batch([self.imgs["kiri"]], force=True)
        self.assert_embedding_is_mean_of(["depan", "kiri", "kanan"])

    def test_03_soft_delete_recomputes_then_removes(self):
        status, res = make_request(f"/api/v1/dental-images/{self.imgs['kanan']}", method="DELETE", token=self.admin)
        self.assertEqual(status, 200, res)
        self.assert_embedding_is_mean_of(["depan", "kiri"])

        for view in ("depan", "kiri"):
            status, res = make_request(f"/api/v1/dental-images/{self.imgs[view]}", method="DELETE", token=self.admin)
            self.assertEqual(status, 200, res)
        self.assertIsNone(self.stored_embedding())


if __name__ == "__main__":
    unittest.main()
