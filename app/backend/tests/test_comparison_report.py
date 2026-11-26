"""
Dentify Tests — Perbandingan Gigi PM vs AM & Laporan Identifikasi INTERPOL (Pekan 12)
Live-server (127.0.0.1:8000, DB/MinIO Docker). tooth_records & embedding uji ditulis
langsung ke DB dengan morfologi yang dirancang, sehingga hasil perbandingan diketahui pasti:

  PM depan : 11 {rotasi 12.0, tambalan 1} conf .90 · 21 {diastema 0} conf .88
  PM kiri  : 11 {rotasi 13.0, tambalan 1} conf .97 · 36 {} conf .70
  AM depan : 11 {rotasi 12.0, tambalan 1} conf .93 · 21 {diastema 1} conf .91
  AM kanan : 46 {tambalan 0} conf .80
  → 11 discrepant (PM pakai deteksi kiri, conf tertinggi: rotasi Δ +1.0, tambalan sama)
    21 discrepant (diastema beda) · 36 pm_only · 46 am_only

1. GET /comparison: status per gigi, agregasi sudut, delta, ringkasan, cakupan citra
2. GET /comparison: akses semua role, 404, 401
3. GET /report: 409 sebelum dikonfirmasi; setelah confirm → isi laporan lengkap
   (keputusan + reviewer dari audit, chain-of-custody citra, narasi RAG belum dibuat)
4. GET /report untuk kandidat yang ditolak → 409

Jalankan dari app/backend/:  python -m unittest tests.test_comparison_report -v
"""

import unittest
from uuid import UUID, uuid4

from sqlalchemy import delete, or_, select

from models.audit_log import AuditLog
from models.embedding import Embedding
from models.matching_result import MatchingResult
from models.tooth_record import ToothRecord
from tests._support import (
    create_subject,
    create_user,
    deactivate_user,
    login,
    make_request,
    run_db,
    upload_image,
    wait_until,
)

TEST_MODEL_VERSION = "test_comparison"


def unit(i: int) -> list[float]:
    v = [0.0] * 512
    v[i] = 1.0
    return v


class TestComparisonAndReport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = login("admin", "admin123")
        cls.viewer_user, cls.viewer = create_user(cls.admin, "viewer", "test_cmp")
        suffix = uuid4().hex[:6]
        cls.case_ref = f"CASE-TEST-{suffix}"
        cls.pm = create_subject(cls.admin, "post_mortem", f"Tes Banding PM {suffix}", cls.case_ref)
        cls.am = create_subject(cls.admin, "ante_mortem", f"Tes Banding AM {suffix}")
        cls.subjects = [cls.pm, cls.am]

        cls.img = {
            "pm_depan": upload_image(cls.admin, cls.pm, "depan"),
            "pm_kiri": upload_image(cls.admin, cls.pm, "kiri"),
            "am_depan": upload_image(cls.admin, cls.am, "depan"),
            "am_kanan": upload_image(cls.admin, cls.am, "kanan"),
        }
        teeth = {
            "pm_depan": [(11, 0.90, {"rotasi": 12.0, "tambalan": 1}), (21, 0.88, {"diastema": 0})],
            "pm_kiri": [(11, 0.97, {"rotasi": 13.0, "tambalan": 1}), (36, 0.70, {})],
            "am_depan": [(11, 0.93, {"rotasi": 12.0, "tambalan": 1}), (21, 0.91, {"diastema": 1})],
            "am_kanan": [(46, 0.80, {"tambalan": 0})],
        }
        # Embedding PM identik dengan AM → AM uji pasti rank 1 (cosine 1)
        vec = unit(int(suffix, 16) % 512)

        async def seed(session):
            for key, rows in teeth.items():
                for fdi, conf, morph in rows:
                    session.add(ToothRecord(
                        dental_image_id=UUID(cls.img[key]["id"]), fdi_number=fdi, confidence_score=conf,
                        morphology_features=morph, bbox={"x": 1, "y": 1, "width": 10, "height": 10},
                    ))
            for sid in cls.subjects:
                session.add(Embedding(subject_id=UUID(sid), vector=vec, model_version=TEST_MODEL_VERSION))
        run_db(seed)

        status, res = make_request(
            "/api/v1/matching-results/run", method="POST", data={"pm_subject_id": cls.pm}, token=cls.admin
        )
        assert status == 200, f"Run matching gagal: {res}"
        top = res["candidates"][0]
        assert top["am_subject_id"] == cls.am, "AM uji seharusnya rank 1"
        cls.match_id = top["id"]
        cls.other_candidate = next((c["id"] for c in res["candidates"][1:] if c["status"] == "pending_review"), None)

    @classmethod
    def tearDownClass(cls):
        ids = [UUID(s) for s in cls.subjects]
        image_ids = [UUID(i["id"]) for i in cls.img.values()]

        async def cleanup(session):
            await session.execute(delete(MatchingResult).where(
                or_(MatchingResult.pm_subject_id.in_(ids), MatchingResult.am_subject_id.in_(ids))
            ))
            await session.execute(delete(Embedding).where(Embedding.subject_id.in_(ids)))
            await session.execute(delete(ToothRecord).where(ToothRecord.dental_image_id.in_(image_ids)))
        run_db(cleanup)
        for sid in cls.subjects:
            make_request(f"/api/v1/subjects/{sid}", method="DELETE", token=cls.admin)
        deactivate_user(cls.admin, cls.viewer_user)

    def comparison(self, token=None):
        return make_request(f"/api/v1/matching-results/{self.match_id}/comparison", token=token or self.viewer)

    def test_01_comparison_per_tooth(self):
        status, res = self.comparison()
        self.assertEqual(status, 200, res)
        by_fdi = {t["fdi_number"]: t for t in res["teeth"]}
        self.assertEqual(sorted(by_fdi), [11, 21, 36, 46])

        t11 = by_fdi[11]
        self.assertEqual(t11["status"], "discrepant")
        self.assertEqual(sorted(t11["pm"]["views"]), ["depan", "kiri"])
        self.assertAlmostEqual(t11["pm"]["confidence"], 97.0, places=1)  # deteksi kiri (conf tertinggi)
        feats = {f["feature"]: f for f in t11["features"]}
        self.assertEqual(feats["rotasi"]["status"], "different")
        self.assertAlmostEqual(feats["rotasi"]["delta"], 1.0)
        self.assertEqual(feats["tambalan"]["status"], "same")

        self.assertEqual(by_fdi[21]["status"], "discrepant")
        self.assertEqual(by_fdi[36]["status"], "pm_only")
        self.assertIsNone(by_fdi[36]["am"])
        self.assertEqual(by_fdi[46]["status"], "am_only")

        self.assertEqual(
            res["summary"],
            {"consistent": 0, "discrepant": 2, "pm_only": 1, "am_only": 1, "features_compared": 3, "features_different": 2},
        )
        self.assertEqual(res["pm_coverage"]["images_total"], 2)
        self.assertEqual(res["pm_coverage"]["images_with_results"], 2)
        self.assertEqual(res["am_coverage"]["images_total"], 2)
        self.assertEqual(res["matching_result"]["id"], self.match_id)

    def test_02_comparison_access(self):
        self.assertEqual(self.comparison(self.admin)[0], 200)
        status, _ = make_request(f"/api/v1/matching-results/{uuid4()}/comparison", token=self.viewer)
        self.assertEqual(status, 404)
        status, _ = make_request(f"/api/v1/matching-results/{self.match_id}/comparison")
        self.assertEqual(status, 401)

    def test_03_report_requires_confirmation_then_complete(self):
        path = f"/api/v1/matching-results/{self.match_id}/report"
        status, res = make_request(path, token=self.viewer)
        self.assertEqual(status, 409, res)
        self.assertIn("dikonfirmasi", res["detail"])

        status, res = make_request(
            f"/api/v1/matching-results/{self.match_id}/confirm", method="POST",
            data={"decision": "confirmed"}, token=self.admin,
        )
        self.assertEqual(status, 200, res)

        # Reviewer diambil dari audit log CONFIRM_MATCH (ditulis background task, ±ms)
        def report_with_reviewer():
            st, r = make_request(path, token=self.viewer)
            return r if st == 200 and r["decision"]["decided_by"] else None
        report = wait_until(report_with_reviewer, timeout=10)
        self.assertIsNotNone(report, "Laporan tanpa reviewer setelah 10 dtk")

        self.assertEqual(report["report_type"], "INTERPOL_DVI_IDENTIFICATION")
        self.assertEqual(report["case_reference"], self.case_ref)
        self.assertEqual(report["pm_subject"]["id"], self.pm)
        self.assertEqual(report["am_subject"]["id"], self.am)
        self.assertEqual(report["decision"]["status"], "confirmed")
        self.assertEqual(report["decision"]["decided_by"]["username"], "admin")
        self.assertEqual(report["decision"]["matched_by"]["username"], "admin")
        self.assertEqual(report["scores"]["rank"], 1)
        self.assertAlmostEqual(report["scores"]["confidence_score"], 100.0, places=1)
        self.assertEqual(report["comparison"]["summary"]["discrepant"], 2)
        # Narasi tidak dibuat oleh GET /report (lihat test_report_narrative)
        self.assertIn(report["narrative"]["status"], {"pending", "not_available"})
        self.assertIsNone(report["narrative"]["content"])
        self.assertEqual(report["generated_by"]["full_name"] is not None, True)

        images = {i["dental_image_id"]: i for i in report["images"]}
        self.assertEqual(set(images), {i["id"] for i in self.img.values()})
        for key, uploaded in self.img.items():
            entry = images[uploaded["id"]]
            self.assertEqual(entry["file_hash"], uploaded["file_hash"])
            self.assertEqual(len(entry["file_hash"]), 64)
            self.assertEqual(entry["uploaded_by"]["username"], "admin")
        self.assertEqual(images[self.img["am_kanan"]["id"]]["teeth_detected"], 1)

        # Pembuatan laporan tercatat di audit log
        async def report_logged(session):
            return await session.scalar(select(AuditLog.id).where(
                AuditLog.action == "GENERATE_REPORT", AuditLog.resource_id == UUID(self.match_id)
            ).limit(1))
        self.assertIsNotNone(wait_until(lambda: run_db(report_logged), timeout=5))

    def test_04_report_for_rejected_candidate_is_409(self):
        if not self.other_candidate:
            self.skipTest("Tidak ada kandidat lain berstatus pending_review di DB dev")
        status, res = make_request(
            f"/api/v1/matching-results/{self.other_candidate}/confirm", method="POST",
            data={"decision": "rejected"}, token=self.admin,
        )
        self.assertEqual(status, 200, res)
        status, res = make_request(f"/api/v1/matching-results/{self.other_candidate}/report", token=self.viewer)
        self.assertEqual(status, 409, res)


if __name__ == "__main__":
    unittest.main()
