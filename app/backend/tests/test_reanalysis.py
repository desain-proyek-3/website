"""
Dentify Tests — Analisis Ulang dengan Confirm/Reject (Pekan 13)

Unit (tanpa server):
1. tooth_rows_from_result: hanya FDI 11–48, duplikat dipertahankan, input rusak → []

Live-server (127.0.0.1:8000) + MOCK AI (127.0.0.1:8100); di-skip bila mock tidak jalan.
Mock AI deterministik (hasil sama tiap kali dijalankan), jadi test MENGUBAH tooth_records &
embedding di DB sebelum analisis ulang agar efek Confirm/Reject bisa dibuktikan:
2. Citra yang belum pernah diproses → 409
3. Hasil analisis ulang DITAHAN: tooth_records & embedding tidak berubah; ai_active/reanalysis di
   respons citra; trigger, reanalyze & batch(force) ditolak/dilewati selama berjalan & menunggu keputusan
4. GET perbandingan: current vs proposed + ringkasan; viewer boleh membaca
5. Viewer tidak boleh memutuskan (403)
6. Reject → hasil lama dipertahankan; keputusan kedua → 409
7. Confirm → tooth_records = hasil usulan, embedding dihitung ulang, ai_status/latest_job_id ikut
8. Analisis ulang gagal → hasil lama tetap; confirm → 409; reject menutupnya
9. RBAC: examiner tidak boleh menganalisis ulang citra AM (403), boleh untuk PM
10. Trigger biasa ganda saat job berjalan → 409

Jalankan dari app/backend/ (backend + mock AI aktif):
    python -m unittest tests.test_reanalysis -v
"""

import time
import unittest
from uuid import UUID, uuid4

from sqlalchemy import delete, select, update

from api.v1.inference import tooth_rows_from_result
from models.dental_image import DentalImage
from models.embedding import Embedding
from models.tooth_record import ToothRecord
from tests._support import (
    MOCK_AI_URL,
    create_subject,
    create_user,
    deactivate_user,
    login,
    make_request,
    run_db,
    service_up,
    upload_image,
)

TAMPERED = "tampered-by-test"


class TestToothRowsUnit(unittest.TestCase):
    def test_01_rows_from_result(self):
        res = {"detected_teeth": [
            {"fdi_id": "11", "confidence": 0.9, "bbox": [1, 2, 3, 4], "morphology": {"caries": 0}},
            {"fdi_id": "11", "confidence": 0.5},              # duplikat dipertahankan
            {"fdi_number": 48, "confidence_score": 0},       # 0 tetap dipakai (bukan None)
            {"fdi_id": "9"}, {"fdi_id": "x"}, {"fdi_id": None}, "bukan-dict",
        ]}
        rows = tooth_rows_from_result(res)
        self.assertEqual([r["fdi_number"] for r in rows], [11, 11, 48])
        self.assertEqual(rows[0]["morphology_features"], {"caries": 0})
        self.assertEqual(rows[2]["confidence_score"], 0)
        self.assertEqual(tooth_rows_from_result({}), [])
        self.assertEqual(tooth_rows_from_result(None), [])
        self.assertEqual(tooth_rows_from_result({"detected_teeth": "rusak"}), [])


class TestReanalysisLive(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not service_up(MOCK_AI_URL):
            raise unittest.SkipTest("Mock AI service tidak jalan di 127.0.0.1:8100 (scripts/mock_ai_service.py)")
        cls.admin = login("admin", "admin123")
        tag = uuid4().hex[:6]
        cls.viewer_user, cls.viewer = create_user(cls.admin, "viewer", "reanalysis")
        cls.examiner_user, cls.examiner = create_user(cls.admin, "examiner", "reanalysis")

        cls.pm = create_subject(cls.admin, "post_mortem", f"Tes Reanalisis PM {tag}")
        cls.pm_img = upload_image(cls.admin, cls.pm, "depan")["id"]
        cls.pm_unprocessed = upload_image(cls.admin, cls.pm, "kiri")["id"]
        cls.am = create_subject(cls.admin, "ante_mortem", f"Tes Reanalisis AM {tag}")
        cls.am_img = upload_image(cls.admin, cls.am, "depan")["id"]

        cls.original_job = cls.trigger_and_wait(cls.pm_img)
        cls.trigger_and_wait(cls.am_img)
        cls.original_fdis = sorted(t["fdi_number"] for t in cls.teeth(cls.pm_img))
        assert len(cls.original_fdis) >= 2, "Mock AI harus mendeteksi minimal 2 gigi"

    @classmethod
    def tearDownClass(cls):
        for sid in (cls.pm, cls.am):
            make_request(f"/api/v1/subjects/{sid}", method="DELETE", token=cls.admin)
        deactivate_user(cls.admin, cls.viewer_user)
        deactivate_user(cls.admin, cls.examiner_user)

    # ── helpers ──
    @classmethod
    def wait_job(cls, job_id, timeout=60):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            status, job = make_request(f"/api/v1/inference/jobs/{job_id}", token=cls.admin)
            assert status == 200, job
            if job["status"] in ("completed", "failed"):
                return job
            time.sleep(0.25)
        raise AssertionError(f"Job {job_id} belum selesai setelah {timeout} dtk")

    @classmethod
    def trigger_and_wait(cls, image_id):
        status, job = make_request(
            "/api/v1/inference/trigger", method="POST", data={"dental_image_id": image_id}, token=cls.admin
        )
        assert status == 202, job
        job = cls.wait_job(job["id"])
        assert job["status"] == "completed", job
        return job

    @classmethod
    def teeth(cls, image_id):
        status, res = make_request(f"/api/v1/dental-images/{image_id}/tooth-records", token=cls.admin)
        assert status == 200, res
        return res["items"]

    def image(self, image_id):
        status, res = make_request(f"/api/v1/dental-images/{image_id}", token=self.admin)
        self.assertEqual(status, 200, res)
        return res

    def reanalyze(self, image_id, token=None, expect=202):
        status, res = make_request(
            "/api/v1/inference/reanalyze", method="POST", data={"dental_image_id": image_id}, token=token or self.admin
        )
        self.assertEqual(status, expect, res)
        return res

    def decide(self, job_id, decision, token=None, expect=200):
        status, res = make_request(
            f"/api/v1/inference/jobs/{job_id}/reanalysis/decision", method="POST",
            data={"decision": decision}, token=token or self.admin,
        )
        self.assertEqual(status, expect, res)
        return res

    def tamper(self):
        """Sisakan 1 tooth_record + tandai embedding subjek, agar perubahan setelah Confirm terlihat."""
        keep = self.original_fdis[0]

        async def op(session):
            await session.execute(
                delete(ToothRecord).where(
                    ToothRecord.dental_image_id == UUID(self.pm_img), ToothRecord.fdi_number != keep
                )
            )
            await session.execute(
                update(Embedding).where(Embedding.subject_id == UUID(self.pm)).values(model_version=TAMPERED)
            )
        run_db(op)
        self.assertEqual([t["fdi_number"] for t in self.teeth(self.pm_img)], [keep])

    def embedding_version(self):
        async def op(session):
            return await session.scalar(select(Embedding.model_version).where(Embedding.subject_id == UUID(self.pm)))
        return run_db(op)

    # ── tests ──
    def test_02_unprocessed_image_conflict(self):
        res = self.reanalyze(self.pm_unprocessed, expect=409)
        self.assertIn("belum pernah", res["detail"])

    def test_03_result_is_held_until_decision(self):
        self.tamper()
        job = self.reanalyze(self.pm_img)
        self.assertEqual(job["request_payload"]["reanalysis"]["review"], "pending")

        img = self.image(self.pm_img)  # selagi berjalan
        self.assertTrue(img["ai_active"])
        self.assertEqual(img["reanalysis"]["job_id"], job["id"])
        self.assertEqual(img["ai_status"], "completed")          # status hasil yang BERLAKU
        self.assertEqual(img["latest_job_id"], self.original_job["id"])
        self.reanalyze(self.pm_img, expect=409)
        status, _ = make_request(
            "/api/v1/inference/trigger", method="POST", data={"dental_image_id": self.pm_img}, token=self.admin
        )
        self.assertEqual(status, 409)

        done = self.wait_job(job["id"])
        self.assertEqual(done["status"], "completed")
        # hasil BELUM diterapkan
        self.assertEqual(len(self.teeth(self.pm_img)), 1)
        self.assertEqual(self.embedding_version(), TAMPERED)
        img = self.image(self.pm_img)
        self.assertFalse(img["ai_active"])
        self.assertEqual(img["reanalysis"]["status"], "completed")
        self.assertEqual(img["latest_job_id"], self.original_job["id"])
        # trigger / reanalyze / batch(force) ditahan sampai diputuskan
        self.reanalyze(self.pm_img, expect=409)
        status, res = make_request(
            "/api/v1/inference/batch", method="POST",
            data={"dental_image_ids": [self.pm_img], "force": True}, token=self.admin,
        )
        self.assertEqual(status, 202, res)
        self.assertEqual(res["jobs"], [])
        self.assertEqual(res["skipped"][0]["reason"], "reanalysis_pending")
        type(self).held_job = job["id"]

    def test_04_comparison(self):
        status, cmp = make_request(f"/api/v1/inference/jobs/{self.held_job}/reanalysis", token=self.viewer)
        self.assertEqual(status, 200, cmp)
        self.assertEqual(cmp["subject_type"], "post_mortem")
        self.assertEqual(cmp["review"], "pending")
        self.assertEqual(cmp["summary"]["current_count"], 1)
        self.assertEqual(sorted({t["fdi_number"] for t in cmp["proposed"]}), self.original_fdis)
        self.assertEqual(cmp["summary"]["kept"], [self.original_fdis[0]])
        self.assertEqual(cmp["summary"]["added"], self.original_fdis[1:])
        self.assertEqual(cmp["summary"]["removed"], [])
        self.assertEqual(cmp["confirmed_matches"], 0)
        self.assertIsNotNone(cmp["proposed"][0]["bbox"])

    def test_05_viewer_cannot_decide(self):
        self.decide(self.held_job, "confirm", token=self.viewer, expect=403)

    def test_06_reject_keeps_old_result(self):
        res = self.decide(self.held_job, "reject")
        self.assertEqual(res["review"], "rejected")
        self.assertEqual(res["tooth_count"], 1)
        self.assertEqual(len(self.teeth(self.pm_img)), 1)
        self.assertEqual(self.embedding_version(), TAMPERED)
        self.assertIsNone(self.image(self.pm_img)["reanalysis"])
        self.decide(self.held_job, "confirm", expect=409)  # sudah diputuskan

    def test_07_confirm_applies_new_result(self):
        job = self.reanalyze(self.pm_img)
        self.assertEqual(self.wait_job(job["id"])["status"], "completed")
        self.assertEqual(len(self.teeth(self.pm_img)), 1)  # masih ditahan

        res = self.decide(job["id"], "confirm")
        self.assertEqual(res["review"], "confirmed")
        teeth = self.teeth(self.pm_img)
        self.assertEqual(sorted({t["fdi_number"] for t in teeth}), self.original_fdis)
        self.assertEqual(res["tooth_count"], len(teeth))
        self.assertNotEqual(self.embedding_version(), TAMPERED)  # dihitung ulang dari hasil berlaku
        self.assertTrue(self.embedding_version().endswith("/mean1"))
        img = self.image(self.pm_img)
        self.assertEqual(img["latest_job_id"], job["id"])
        self.assertIsNone(img["reanalysis"])
        status, cmp = make_request(f"/api/v1/inference/jobs/{job['id']}/reanalysis", token=self.admin)
        self.assertEqual(status, 200)
        self.assertEqual(cmp["review"], "confirmed")
        self.assertEqual(cmp["summary"]["added"], [])
        self.assertEqual(cmp["summary"]["removed"], [])

    def test_08_failed_reanalysis_keeps_old_result(self):
        before = len(self.teeth(self.pm_img))

        async def set_path(session, path):
            await session.execute(update(DentalImage).where(DentalImage.id == UUID(self.pm_img)).values(file_path=path))

        async def get_path(session):
            return await session.scalar(select(DentalImage.file_path).where(DentalImage.id == UUID(self.pm_img)))

        original_path = run_db(get_path)
        run_db(lambda s: set_path(s, f"tidak-ada/{uuid4().hex}.png"))  # mock AI gagal mengunduh citra
        try:
            job = self.reanalyze(self.pm_img)
            self.assertEqual(self.wait_job(job["id"])["status"], "failed")
        finally:
            run_db(lambda s: set_path(s, original_path))

        self.assertEqual(len(self.teeth(self.pm_img)), before)
        img = self.image(self.pm_img)
        self.assertEqual(img["ai_status"], "completed")
        self.assertEqual(img["reanalysis"]["status"], "failed")
        self.assertTrue(img["reanalysis"]["error_message"])
        status, _ = make_request(f"/api/v1/inference/jobs/{job['id']}/reanalysis", token=self.admin)
        self.assertEqual(status, 409)
        self.decide(job["id"], "confirm", expect=409)
        self.decide(job["id"], "reject")
        self.assertIsNone(self.image(self.pm_img)["reanalysis"])

    def test_09_rbac(self):
        self.reanalyze(self.am_img, token=self.examiner, expect=403)
        self.reanalyze(self.pm_img, token=self.viewer, expect=403)
        job = self.reanalyze(self.pm_img, token=self.examiner)
        self.wait_job(job["id"])
        self.decide(job["id"], "reject", token=self.examiner)
        am_job = self.reanalyze(self.am_img)  # admin boleh AM
        self.wait_job(am_job["id"])
        self.decide(am_job["id"], "reject", token=self.examiner, expect=403)
        self.decide(am_job["id"], "reject")

    def test_10_double_trigger_conflict(self):
        status, job = make_request(
            "/api/v1/inference/trigger", method="POST", data={"dental_image_id": self.pm_img}, token=self.admin
        )
        self.assertEqual(status, 202, job)
        status, res = make_request(
            "/api/v1/inference/trigger", method="POST", data={"dental_image_id": self.pm_img}, token=self.admin
        )
        self.assertEqual(status, 409, res)
        self.wait_job(job["id"])


if __name__ == "__main__":
    unittest.main()
