"""
Dentify Tests — Matching Results & Stats API Integration Tests
Menguji pencocokan AM vs PM (pgvector cosine similarity) terhadap server live
(127.0.0.1:8000). Embedding uji ditulis langsung ke DB (AI service tidak dipakai):
1. Run matching → kandidat AM terurut, PM "dekat" AM target di rank 1, AM soft-deleted
   tidak ikut, top_k default 3, confidence = cosine × 100
2. Re-run → baris pending_review lama diganti, tidak menumpuk
3. Confirm/reject → status berubah, keputusan ganda 409, pasangan yang sudah
   diputuskan tidak dibuat ulang saat re-run
4. Validasi: PM tanpa embedding 409, subjek AM sebagai PM 400, subjek tidak ada 404
5. RBAC: viewer hanya bisa GET (403 untuk run/confirm), tanpa token 401
6. GET /stats/summary
7. Soft-delete subjek PM menyembunyikan hasil pencocokannya

Jalankan dari direktori app/backend/ (server & Docker harus aktif):
    python -m unittest tests.test_matching -v

Embedding & matching_results uji dihapus, subjek di-soft-delete, dan akun uji
dinonaktifkan di tearDownClass.
"""

import asyncio
import json
import math
import random
import sys
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from uuid import UUID, uuid4

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete, or_

import models  # noqa: F401 — registrasi seluruh relasi ORM
from core.database import async_session_factory, engine
from models.embedding import Embedding
from models.matching_result import MatchingResult

BASE_URL = "http://127.0.0.1:8000"
TEST_MODEL_VERSION = "test_matching"


def make_request(
    path: str,
    method: str = "GET",
    data: bytes | dict | None = None,
    content_type: str = "application/json",
    token: str | None = None,
) -> tuple[int, dict]:
    headers = {}
    if data is not None and content_type:
        headers["Content-Type"] = content_type
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if isinstance(data, dict) else data
    req = urllib.request.Request(f"{BASE_URL}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read().decode("utf-8")
            return resp.status, json.loads(resp_body) if resp_body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {"error": err_body}


def run_db(operation) -> None:
    """Jalankan operasi async terhadap DB dalam satu transaksi (event loop terpisah)."""
    async def runner():
        try:
            async with async_session_factory() as session:
                await operation(session)
                await session.commit()
        finally:
            await engine.dispose()  # koneksi pool terikat ke event loop ini
    asyncio.run(runner())


def unit_vector(rng: random.Random) -> list[float]:
    vec = [rng.gauss(0.0, 1.0) for _ in range(512)]
    norm = math.sqrt(sum(v * v for v in vec))
    return [v / norm for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


def subject_payload(subject_type: str, name: str) -> dict:
    return {"subject_type": subject_type, "full_name": name, "case_reference": None, "notes": None}


class TestMatchingResults(unittest.TestCase):
    subjects: list[str] = []
    users: list[dict] = []

    @classmethod
    def create_user(cls, role: str, suffix: str) -> tuple[dict, str]:
        password = f"{role}-123456"
        status, res = make_request(
            "/api/v1/users",
            method="POST",
            data={
                "username": f"test_match_{role}_{suffix}",
                "email": f"match.{role}.{suffix}@dentify.test",
                "full_name": f"Matching Test {role}",
                "role": role,
                "password": password,
            },
            token=cls.admin,
        )
        assert status == 201, f"Pembuatan {role} gagal: {res}"
        cls.users.append(res)
        status, login = make_request(
            "/api/v1/auth/login", method="POST", data={"username": res["username"], "password": password}
        )
        assert status == 200, f"Login {role} gagal: {login}"
        return res, login["access_token"]

    @classmethod
    def create_subject(cls, subject_type: str, name: str) -> str:
        status, res = make_request(
            "/api/v1/subjects", method="POST", data=subject_payload(subject_type, name), token=cls.admin
        )
        assert status == 201, f"Pembuatan subjek gagal: {res}"
        cls.subjects.append(res["id"])
        return res["id"]

    @classmethod
    def setUpClass(cls):
        status, res = make_request(
            "/api/v1/auth/login", method="POST", data={"username": "admin", "password": "admin123"}
        )
        assert status == 200, f"Login admin gagal: {res}"
        cls.admin = res["access_token"]

        suffix = uuid4().hex[:6]
        cls.examiner_user, cls.examiner = cls.create_user("examiner", suffix)
        cls.viewer_user, cls.viewer = cls.create_user("viewer", suffix)

        cls.am_target = cls.create_subject("ante_mortem", f"Tes Matching AM Target {suffix}")
        cls.am_other = cls.create_subject("ante_mortem", f"Tes Matching AM Lain {suffix}")
        cls.am_third = cls.create_subject("ante_mortem", f"Tes Matching AM Ketiga {suffix}")
        cls.am_deleted = cls.create_subject("ante_mortem", f"Tes Matching AM Dihapus {suffix}")
        cls.pm = cls.create_subject("post_mortem", f"Tes Matching PM {suffix}")
        cls.pm_no_embedding = cls.create_subject("post_mortem", f"Tes Matching PM Kosong {suffix}")

        # PM = AM target + noise kecil (rank 1); AM lain & AM ketiga = PM + noise lebih besar
        # (cosine ~0.7 & ~0.45, tetap di atas embedding acak lain di DB → rank 2 & 3,
        # sehingga top-3 selalu berisi subjek uji); AM yang akan dihapus =
        # identik dengan PM (seharusnya rank 1 bila soft-delete tidak difilter)
        rng = random.Random(suffix)
        am_target_vec = unit_vector(rng)
        pm_vec = [a + 0.1 * n for a, n in zip(am_target_vec, unit_vector(rng))]
        cls.expected_cosine = cosine(pm_vec, am_target_vec)
        vectors = {
            cls.am_target: am_target_vec,
            cls.am_other: [p + 1.0 * n for p, n in zip(pm_vec, unit_vector(rng))],
            cls.am_third: [p + 2.0 * n for p, n in zip(pm_vec, unit_vector(rng))],
            cls.am_deleted: pm_vec,
            cls.pm: pm_vec,
        }

        async def insert_embeddings(session):
            for subject_id, vec in vectors.items():
                session.add(
                    Embedding(subject_id=UUID(subject_id), vector=vec, model_version=TEST_MODEL_VERSION)
                )
        run_db(insert_embeddings)

        status, res = make_request(f"/api/v1/subjects/{cls.am_deleted}", method="DELETE", token=cls.admin)
        assert status == 200, f"Soft-delete AM gagal: {res}"

    @classmethod
    def tearDownClass(cls):
        subject_ids = [UUID(s) for s in cls.subjects]

        async def cleanup(session):
            await session.execute(
                delete(MatchingResult).where(
                    or_(
                        MatchingResult.pm_subject_id.in_(subject_ids),
                        MatchingResult.am_subject_id.in_(subject_ids),
                    )
                )
            )
            await session.execute(delete(Embedding).where(Embedding.subject_id.in_(subject_ids)))
        run_db(cleanup)

        for subject_id in cls.subjects:
            make_request(f"/api/v1/subjects/{subject_id}", method="DELETE", token=cls.admin)
        for u in cls.users:
            make_request(
                f"/api/v1/users/{u['id']}",
                method="PUT",
                data={"email": u["email"], "full_name": u["full_name"], "role": u["role"], "is_active": False},
                token=cls.admin,
            )

    def run_matching(self, pm_subject_id: str, token: str | None = None, **extra) -> tuple[int, dict]:
        return make_request(
            "/api/v1/matching-results/run",
            method="POST",
            data={"pm_subject_id": pm_subject_id, **extra},
            token=token or self.examiner,
        )

    def pending_for_pm(self) -> dict:
        status, res = make_request(
            f"/api/v1/matching-results?pm_subject_id={self.pm}&status=pending_review", token=self.viewer
        )
        self.assertEqual(status, 200, res)
        return res

    def test_01_run_ranks_target_first_and_skips_deleted_am(self):
        status, res = self.run_matching(self.pm)
        self.assertEqual(status, 200, res)
        self.assertEqual(res["top_k"], 3)
        candidates = res["candidates"]
        self.assertEqual(len(candidates), 3)

        top = candidates[0]
        self.assertEqual(top["am_subject_id"], self.am_target)
        self.assertEqual(top["rank"], 1)
        self.assertEqual(top["status"], "pending_review")
        self.assertEqual(top["matched_by"], self.examiner_user["id"])
        self.assertEqual(top["pm_subject"]["subject_type"], "post_mortem")
        self.assertEqual(top["am_subject"]["subject_type"], "ante_mortem")
        self.assertAlmostEqual(top["cosine_similarity"], self.expected_cosine, places=3)
        self.assertAlmostEqual(top["confidence_score"], round(self.expected_cosine * 100, 2), places=1)

        am_ids = [c["am_subject_id"] for c in candidates]
        self.assertNotIn(self.am_deleted, am_ids)
        self.assertEqual([c["rank"] for c in candidates], list(range(1, len(candidates) + 1)))
        scores = [c["cosine_similarity"] for c in candidates]
        self.assertEqual(scores, sorted(scores, reverse=True))

        status, res = self.run_matching(self.pm, top_k=1)
        self.assertEqual(status, 200, res)
        self.assertEqual(len(res["candidates"]), 1)

    def test_02_rerun_replaces_pending_results(self):
        status, first = self.run_matching(self.pm)
        self.assertEqual(status, 200, first)
        status, second = self.run_matching(self.pm)
        self.assertEqual(status, 200, second)

        first_ids = {c["id"] for c in first["candidates"]}
        second_ids = {c["id"] for c in second["candidates"]}
        self.assertTrue(first_ids.isdisjoint(second_ids))

        pending = self.pending_for_pm()
        self.assertEqual(pending["total"], len(second["candidates"]))
        self.assertEqual({r["id"] for r in pending["items"]}, second_ids)

    def test_03_confirm_reject_and_rerun_keeps_decisions(self):
        status, res = self.run_matching(self.pm)
        self.assertEqual(status, 200, res)
        target = next(c for c in res["candidates"] if c["am_subject_id"] == self.am_target)
        other = next(c for c in res["candidates"] if c["am_subject_id"] == self.am_other)

        status, confirmed = make_request(
            f"/api/v1/matching-results/{target['id']}/confirm",
            method="POST", data={"decision": "confirmed"}, token=self.examiner,
        )
        self.assertEqual(status, 200, confirmed)
        self.assertEqual(confirmed["status"], "confirmed")

        status, again = make_request(
            f"/api/v1/matching-results/{target['id']}/confirm",
            method="POST", data={"decision": "rejected"}, token=self.examiner,
        )
        self.assertEqual(status, 409, again)

        status, rejected = make_request(
            f"/api/v1/matching-results/{other['id']}/confirm",
            method="POST", data={"decision": "rejected"}, token=self.admin,
        )
        self.assertEqual(status, 200, rejected)
        self.assertEqual(rejected["status"], "rejected")

        # Re-run: pasangan yang sudah diputuskan dikembalikan apa adanya, tidak dibuat ulang
        status, rerun = self.run_matching(self.pm)
        self.assertEqual(status, 200, rerun)
        by_am = {c["am_subject_id"]: c for c in rerun["candidates"]}
        self.assertEqual(by_am[self.am_target]["id"], target["id"])
        self.assertEqual(by_am[self.am_target]["status"], "confirmed")
        self.assertEqual(by_am[self.am_other]["id"], other["id"])
        self.assertEqual(by_am[self.am_other]["status"], "rejected")
        self.assertEqual(rerun["candidates"][0]["am_subject_id"], self.am_target)

        self.assertEqual(rerun["candidates"][2]["am_subject_id"], self.am_third)
        self.assertEqual(rerun["candidates"][2]["status"], "pending_review")

        pending = self.pending_for_pm()
        self.assertEqual(pending["total"], 1)

        status, res = make_request(
            f"/api/v1/matching-results?pm_subject_id={self.pm}&am_subject_id={self.am_target}",
            token=self.viewer,
        )
        self.assertEqual(status, 200, res)
        self.assertEqual(res["total"], 1)

    def test_04_validation_errors(self):
        status, res = self.run_matching(self.pm_no_embedding)
        self.assertEqual(status, 409, res)
        status, res = self.run_matching(self.am_target, token=self.admin)
        self.assertEqual(status, 400, res)
        status, res = self.run_matching(str(uuid4()))
        self.assertEqual(status, 404, res)
        status, res = self.run_matching(self.am_deleted)
        self.assertEqual(status, 404, res)
        status, res = self.run_matching(self.pm, top_k=0)
        self.assertEqual(status, 422, res)
        status, res = make_request(f"/api/v1/matching-results/{uuid4()}", token=self.viewer)
        self.assertEqual(status, 404, res)
        status, res = make_request(
            f"/api/v1/matching-results/{uuid4()}/confirm",
            method="POST", data={"decision": "confirmed"}, token=self.examiner,
        )
        self.assertEqual(status, 404, res)

    def test_05_rbac(self):
        status, res = self.run_matching(self.pm, token=self.viewer)
        self.assertEqual(status, 403, res)

        pending = self.pending_for_pm()
        self.assertGreater(pending["total"], 0)
        result_id = pending["items"][0]["id"]
        status, res = make_request(
            f"/api/v1/matching-results/{result_id}/confirm",
            method="POST", data={"decision": "confirmed"}, token=self.viewer,
        )
        self.assertEqual(status, 403, res)

        status, res = make_request(f"/api/v1/matching-results/{result_id}", token=self.viewer)
        self.assertEqual(status, 200, res)
        self.assertEqual(res["id"], result_id)

        status, _ = make_request("/api/v1/matching-results")
        self.assertEqual(status, 401)
        status, _ = make_request(
            "/api/v1/matching-results/run", method="POST", data={"pm_subject_id": self.pm}
        )
        self.assertEqual(status, 401)
        status, _ = make_request("/api/v1/stats/summary")
        self.assertEqual(status, 401)

    def test_06_stats_summary(self):
        status, res = make_request("/api/v1/stats/summary", token=self.viewer)
        self.assertEqual(status, 200, res)
        self.assertEqual(set(res), {"subjects", "dental_images", "embeddings", "inference_jobs", "matching_results"})
        self.assertGreaterEqual(res["subjects"]["ante_mortem"], 3)
        self.assertGreaterEqual(res["subjects"]["post_mortem"], 2)
        self.assertGreaterEqual(res["embeddings"]["ante_mortem"], 3)
        self.assertGreaterEqual(res["embeddings"]["post_mortem"], 1)
        self.assertEqual(set(res["inference_jobs"]), {"pending", "processing", "completed", "failed"})
        self.assertGreaterEqual(res["matching_results"]["confirmed"], 1)
        self.assertGreaterEqual(res["matching_results"]["rejected"], 1)

    def test_07_soft_deleted_pm_hides_results(self):
        status, res = make_request(f"/api/v1/subjects/{self.pm}", method="DELETE", token=self.admin)
        self.assertEqual(status, 200, res)
        status, res = make_request(f"/api/v1/matching-results?pm_subject_id={self.pm}", token=self.viewer)
        self.assertEqual(status, 200, res)
        self.assertEqual(res["total"], 0)


if __name__ == "__main__":
    unittest.main()
