"""
Dentify Tests — Pencocokan per sudut (services/view_matching.py, Pekan 14)
Live-server (DENTIFY_TEST_BASE_URL, default 127.0.0.1:8000), DB/MinIO Docker lokal.

Skenario utama meniru temuan diagnostik 26 Nov: kandidat B "mirip rata-rata" PM (semua
sudutnya vektor yang sama dengan rata-rata sudut PM) sehingga MENANG dengan cara lama
(rata-rata PM vs rata-rata AM, cosine 1,0 vs 0,8), padahal di setiap sudut yang sama
kandidat A jauh lebih mirip (0,8 vs 0,577). Cara baru harus memilih A.

  PM  : depan e1, kiri e2, kanan e3
  AM A: depan 0.8·e1+0.6·e4, kiri 0.8·e2+0.6·e5, kanan 0.8·e3+0.6·e6   → per sudut 0.8
  AM B: ketiga sudut (e1+e2+e3)/√3                                      → per sudut 0.577
  AM C: hanya sudut kanan e1 (tidak punya sudut yang sama dengan PM2)

1. PM 3 sudut → A rank 1 (3 suara, 3/3 sudut, skor 0.8), B rank 2 (0 suara);
   sebagai pembanding, perhitungan cara lama memang memilih B
2. PM2 hanya sudut depan → views_compared 1, pm_views [depan]; AM C tidak ikut
   (am_without_common_view ≥ 1)
3. Sinkronisasi: inferensi (mock AI) selesai → view_embeddings citra terisi = embedding
   job; citra dihapus → view_embeddings citra itu ikut hilang
4. Hasil tersimpan (GET /matching-results/{id}) memuat rincian per sudut

Jalankan dari app/backend/ (backend + mock AI aktif):  python -m unittest tests.test_view_matching -v
"""

import math
import unittest
from uuid import UUID, uuid4

from sqlalchemy import delete, or_, select

from models.embedding import Embedding
from models.matching_result import MatchingResult
from models.view_embedding import ViewEmbedding
from services.subject_embedding import mean_embedding
from tests._support import (
    MOCK_AI_URL,
    add_view_embeddings,
    create_subject,
    login,
    make_request,
    run_db,
    service_up,
    upload_image,
    wait_until,
)

TEST_MODEL_VERSION = "test_view_matching"
VIEWS = ("depan", "kiri", "kanan")


def vec(**parts: float) -> list[float]:
    """Vektor 512-dim dari komponen bernama e<idx>=bobot (dimensi dipilih per-run)."""
    v = [0.0] * 512
    for name, weight in parts.items():
        v[int(name[1:])] += weight
    return v


def cos(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


class TestViewMatching(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = login("admin", "admin123")
        suffix = uuid4().hex[:6]
        base = int(suffix, 16) % 500  # dimensi e(base)…e(base+5), beda tiap run
        e = [f"e{base + i}" for i in range(6)]

        cls.pm = create_subject(cls.admin, "post_mortem", f"Tes Sudut PM {suffix}")
        cls.pm2 = create_subject(cls.admin, "post_mortem", f"Tes Sudut PM2 {suffix}")
        cls.am_a = create_subject(cls.admin, "ante_mortem", f"Tes Sudut AM-A {suffix}")
        cls.am_b = create_subject(cls.admin, "ante_mortem", f"Tes Sudut AM-B {suffix}")
        cls.am_c = create_subject(cls.admin, "ante_mortem", f"Tes Sudut AM-C {suffix}")
        cls.subjects = [cls.pm, cls.pm2, cls.am_a, cls.am_b, cls.am_c]

        third = 1 / math.sqrt(3)
        b_vec = vec(**{e[0]: third, e[1]: third, e[2]: third})
        cls.vectors = {
            cls.pm: {"depan": vec(**{e[0]: 1}), "kiri": vec(**{e[1]: 1}), "kanan": vec(**{e[2]: 1})},
            cls.pm2: {"depan": vec(**{e[0]: 1})},
            cls.am_a: {
                "depan": vec(**{e[0]: 0.8, e[3]: 0.6}),
                "kiri": vec(**{e[1]: 0.8, e[4]: 0.6}),
                "kanan": vec(**{e[2]: 0.8, e[5]: 0.6}),
            },
            cls.am_b: {v: b_vec for v in VIEWS},
            cls.am_c: {"kanan": vec(**{e[0]: 1})},
        }
        cls.images = {
            sid: {view: upload_image(cls.admin, sid, view) for view in views}
            for sid, views in cls.vectors.items()
        }

        async def seed(session):
            add_view_embeddings(session, [
                (sid, cls.images[sid][view], view, v)
                for sid, views in cls.vectors.items() for view, v in views.items()
            ], TEST_MODEL_VERSION)
        run_db(seed)

    @classmethod
    def tearDownClass(cls):
        ids = [UUID(s) for s in cls.subjects]

        async def cleanup(session):
            await session.execute(delete(MatchingResult).where(
                or_(MatchingResult.pm_subject_id.in_(ids), MatchingResult.am_subject_id.in_(ids))
            ))
            await session.execute(delete(ViewEmbedding).where(ViewEmbedding.subject_id.in_(ids)))
            await session.execute(delete(Embedding).where(Embedding.subject_id.in_(ids)))
        run_db(cleanup)
        for sid in cls.subjects:
            make_request(f"/api/v1/subjects/{sid}", method="DELETE", token=cls.admin)

    def run_matching(self, pm_id, top_k=10):
        return make_request(
            "/api/v1/matching-results/run", method="POST",
            data={"pm_subject_id": pm_id, "top_k": top_k}, token=self.admin,
        )

    def test_01_same_view_beats_cross_view_average(self):
        # Pembanding: cara lama (rata-rata sudut) memang memilih B
        pm_mean = mean_embedding(list(self.vectors[self.pm].values()))
        old_a = cos(pm_mean, mean_embedding(list(self.vectors[self.am_a].values())))
        old_b = cos(pm_mean, mean_embedding(list(self.vectors[self.am_b].values())))
        self.assertGreater(old_b, old_a)

        status, res = self.run_matching(self.pm)
        self.assertEqual(status, 200, res)
        self.assertEqual(res["pm_views"], list(VIEWS))
        by_am = {c["am_subject_id"]: c for c in res["candidates"]}
        order = [c["am_subject_id"] for c in res["candidates"]]
        self.assertEqual(order[0], self.am_a)
        self.assertLess(order.index(self.am_a), order.index(self.am_b))
        # C hanya punya sudut kanan (= e1, identik PM depan): dibandingkan HANYA dengan PM kanan
        # (e3) → skor 0, tidak "terbantu" kemiripan lintas sudut (bisa di luar 10 besar)
        if self.am_c in by_am:
            self.assertEqual(by_am[self.am_c]["views_compared"], 1)
            self.assertAlmostEqual(by_am[self.am_c]["cosine_similarity"], 0.0, places=4)
        self.assertLess(by_am.get(self.am_c, {"cosine_similarity": 0})["cosine_similarity"], 0.1)

        a = by_am[self.am_a]
        self.assertEqual(a["match_method"], "per_view")
        self.assertEqual(a["views_compared"], 3)
        self.assertEqual(a["view_votes"], 3)
        self.assertAlmostEqual(a["cosine_similarity"], 0.8, places=4)
        self.assertAlmostEqual(a["confidence_score"], 80.0, places=1)
        for view in VIEWS:
            self.assertAlmostEqual(a["view_scores"][view]["cos"], 0.8, places=4)
            self.assertEqual(a["view_scores"][view]["rank"], 1)

        b = by_am[self.am_b]
        self.assertAlmostEqual(b["cosine_similarity"], 1 / math.sqrt(3), places=4)
        self.assertEqual(b["view_votes"], 0)
        self.__class__.result_a = a["id"]

    def test_02_partial_pm_and_am_without_common_view(self):
        status, res = self.run_matching(self.pm2)
        self.assertEqual(status, 200, res)
        self.assertEqual(res["pm_views"], ["depan"])
        by_am = {c["am_subject_id"]: c for c in res["candidates"]}
        self.assertEqual(res["candidates"][0]["am_subject_id"], self.am_a)
        self.assertEqual(by_am[self.am_a]["views_compared"], 1)
        self.assertEqual(set(by_am[self.am_a]["view_scores"]), {"depan"})
        # AM C hanya punya sudut kanan — tidak bisa dibandingkan dengan PM2 (hanya depan)
        self.assertNotIn(self.am_c, by_am)
        self.assertGreaterEqual(res["am_without_common_view"], 1)

    def test_03_stored_result_has_view_breakdown(self):
        status, res = make_request(f"/api/v1/matching-results/{self.result_a}", token=self.admin)
        self.assertEqual(status, 200, res)
        self.assertEqual(res["views_compared"], 3)
        self.assertEqual(res["view_votes"], 3)
        self.assertEqual(set(res["view_scores"]), set(VIEWS))

    def test_04_view_embeddings_follow_inference_and_delete(self):
        if not service_up(MOCK_AI_URL):
            self.skipTest(f"Mock AI tidak berjalan di {MOCK_AI_URL}")
        subject = create_subject(self.admin, "post_mortem", f"Tes Sudut Sinkron {uuid4().hex[:6]}")
        self.subjects.append(subject)
        image = upload_image(self.admin, subject, "kiri")
        status, job = make_request(
            "/api/v1/inference/trigger", method="POST", data={"dental_image_id": image["id"]}, token=self.admin
        )
        self.assertIn(status, (200, 202), job)
        done = wait_until(
            lambda: (lambda r: r[1] if r[1].get("status") in ("completed", "failed") else None)(
                make_request(f"/api/v1/inference/jobs/{job['id']}", token=self.admin)
            ),
            timeout=60,
        )
        self.assertIsNotNone(done, "Job inferensi tidak selesai")
        self.assertEqual(done["status"], "completed", done)

        async def view_rows(session):
            return (await session.execute(
                select(ViewEmbedding.view_type, ViewEmbedding.vector).where(
                    ViewEmbedding.dental_image_id == UUID(image["id"])
                )
            )).all()
        rows = run_db(view_rows)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].view_type, "kiri")
        expected = done["result_payload"]["subject_embedding"]
        self.assertAlmostEqual(cos(list(rows[0].vector), expected), 1.0, places=5)

        status, res = make_request(f"/api/v1/dental-images/{image['id']}", method="DELETE", token=self.admin)
        self.assertEqual(status, 200, res)
        self.assertEqual(run_db(view_rows), [])

        status, res = self.run_matching(subject)
        self.assertEqual(status, 409, res)  # tidak ada lagi embedding sudut


if __name__ == "__main__":
    unittest.main()
