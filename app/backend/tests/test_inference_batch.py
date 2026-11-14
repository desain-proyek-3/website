"""
Dentify Tests — Status AI per Citra, Daftar Citra Belum Diproses & Batch Inferensi (Pekan 12)
Live-server (127.0.0.1:8000) + MOCK AI service (127.0.0.1:8100, scripts/mock_ai_service.py);
di-skip bila mock AI tidak jalan. Asumsi AI_SERVICE_MAX_CONCURRENT_JOBS = 2 (default).

1. Citra baru: ai_status 'none', ai_processed False; muncul di GET /dental-images/unprocessed
2. Examiner batch [AM, PM, PM, id acak, duplikat] → 2 job PM; AM 'forbidden', acak 'not_found',
   duplikat dibuang; maks. 2 job 'processing' bersamaan; selesai → tooth_records & embedding
   tersimpan, ai_status 'completed', hilang dari daftar unprocessed
3. Batch ulang → 'already_processed'; force=true → diproses ulang; admin boleh batch citra AM
4. Batch saat job masih berjalan → 'already_running'
5. Validasi & RBAC: viewer 403, list kosong 422, > 50 citra 422, tanpa token 401
6. recover_interrupted_jobs() menandai job pending/processing yang tertinggal → failed

Jalankan dari app/backend/ (backend + mock AI aktif):
    python -m unittest tests.test_inference_batch -v
"""

import asyncio
import time
import unittest
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select

from models.embedding import Embedding
from models.inference_job import InferenceJob
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
    wait_until,
)

MAX_CONCURRENT = 2


class TestInferenceBatch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not service_up(MOCK_AI_URL):
            raise unittest.SkipTest("Mock AI service tidak jalan di 127.0.0.1:8100 (scripts/mock_ai_service.py)")
        cls.admin = login("admin", "admin123")
        cls.examiner_user, cls.examiner = create_user(cls.admin, "examiner", "test_batch")
        cls.viewer_user, cls.viewer = create_user(cls.admin, "viewer", "test_batch")
        suffix = uuid4().hex[:6]
        cls.am = create_subject(cls.admin, "ante_mortem", f"Tes Batch AM {suffix}")
        cls.pm = create_subject(cls.admin, "post_mortem", f"Tes Batch PM {suffix}")
        cls.pm2 = create_subject(cls.admin, "post_mortem", f"Tes Batch PM2 {suffix}")
        cls.subjects = [cls.am, cls.pm, cls.pm2]
        cls.am_img = upload_image(cls.admin, cls.am, "depan")["id"]
        cls.pm_imgs = [upload_image(cls.admin, cls.pm, v)["id"] for v in ("depan", "kiri")]
        cls.pm2_imgs = [upload_image(cls.admin, cls.pm2, v)["id"] for v in ("depan", "kiri", "kanan")]

    @classmethod
    def tearDownClass(cls):
        ids = [UUID(s) for s in cls.subjects]

        async def cleanup(session):
            await session.execute(delete(Embedding).where(Embedding.subject_id.in_(ids)))
            await session.execute(delete(ToothRecord).where(ToothRecord.dental_image_id.in_(
                select(InferenceJob.dental_image_id).where(InferenceJob.subject_id.in_(ids))
            )))
        # tunggu job yang masih berjalan agar tidak menulis setelah cleanup
        wait_until(lambda: not run_db(cls._active_jobs_for(ids)), timeout=60)
        run_db(cleanup)
        for sid in cls.subjects:
            make_request(f"/api/v1/subjects/{sid}", method="DELETE", token=cls.admin)
        deactivate_user(cls.admin, cls.examiner_user)
        deactivate_user(cls.admin, cls.viewer_user)

    @staticmethod
    def _active_jobs_for(subject_ids):
        async def op(session):
            return await session.scalar(select(func.count()).select_from(InferenceJob).where(
                InferenceJob.subject_id.in_(subject_ids), InferenceJob.status.in_(("pending", "processing"))
            ))
        return op

    def batch(self, ids, token=None, force=False):
        return make_request(
            "/api/v1/inference/batch", method="POST",
            data={"dental_image_ids": ids, "force": force}, token=token or self.examiner,
        )

    def job(self, job_id):
        status, res = make_request(f"/api/v1/inference/jobs/{job_id}", token=self.viewer)
        self.assertEqual(status, 200, res)
        return res

    def wait_jobs_done(self, job_ids, timeout=60, max_processing=None):
        peak = 0
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            statuses = [self.job(j)["status"] for j in job_ids]
            peak = max(peak, statuses.count("processing"))
            if max_processing is not None:
                self.assertLessEqual(statuses.count("processing"), max_processing, statuses)
            if all(s in ("completed", "failed") for s in statuses):
                return statuses, peak
            time.sleep(0.25)
        self.fail(f"Job belum selesai setelah {timeout} dtk")

    def subject_images(self, subject_id):
        status, res = make_request(f"/api/v1/subjects/{subject_id}/images", token=self.viewer)
        self.assertEqual(status, 200, res)
        return {i["id"]: i for i in res["items"]}

    def unprocessed_ids(self, subject_type=None):
        q = f"?subject_type={subject_type}&limit=200" if subject_type else "?limit=200"
        status, res = make_request(f"/api/v1/dental-images/unprocessed{q}", token=self.viewer)
        self.assertEqual(status, 200, res)
        self.assertEqual(set(res["counts"]), {"ante_mortem", "post_mortem"})
        return res, {i["id"] for i in res["items"]}

    def test_01_new_images_are_unprocessed(self):
        imgs = self.subject_images(self.pm)
        for img_id in self.pm_imgs:
            self.assertEqual(imgs[img_id]["ai_status"], "none")
            self.assertFalse(imgs[img_id]["ai_processed"])
            self.assertIsNone(imgs[img_id]["latest_job_id"])

        res, pm_ids = self.unprocessed_ids("post_mortem")
        self.assertTrue(set(self.pm_imgs) <= pm_ids)
        self.assertNotIn(self.am_img, pm_ids)
        self.assertEqual(res["total"], res["counts"]["post_mortem"])
        _, am_ids = self.unprocessed_ids("ante_mortem")
        self.assertIn(self.am_img, am_ids)
        item = next(i for i in res["items"] if i["id"] == self.pm_imgs[0])
        self.assertEqual(item["subject_id"], self.pm)
        self.assertEqual(item["subject_type"], "post_mortem")

        status, detail = make_request(f"/api/v1/dental-images/{self.pm_imgs[0]}", token=self.viewer)
        self.assertEqual(status, 200)
        self.assertEqual(detail["ai_status"], "none")

    def test_02_examiner_batch_respects_rbac_and_concurrency(self):
        random_id = str(uuid4())
        ids = [self.am_img, *self.pm2_imgs, random_id, self.pm2_imgs[0]]
        status, res = self.batch(ids)
        self.assertEqual(status, 202, res)
        self.assertEqual(res["max_concurrent"], MAX_CONCURRENT)
        self.assertEqual(sorted(j["dental_image_id"] for j in res["jobs"]), sorted(self.pm2_imgs))
        self.assertTrue(all(j["status"] == "pending" for j in res["jobs"]))
        reasons = {s["dental_image_id"]: s["reason"] for s in res["skipped"]}
        self.assertEqual(reasons, {self.am_img: "forbidden", random_id: "not_found"})

        statuses, peak = self.wait_jobs_done([j["id"] for j in res["jobs"]], max_processing=MAX_CONCURRENT)
        self.assertEqual(statuses, ["completed"] * 3)
        self.assertGreaterEqual(peak, 1)

        imgs = self.subject_images(self.pm2)
        for img_id in self.pm2_imgs:
            self.assertEqual(imgs[img_id]["ai_status"], "completed")
            self.assertTrue(imgs[img_id]["ai_processed"])
            status, teeth = make_request(f"/api/v1/dental-images/{img_id}/tooth-records", token=self.viewer)
            self.assertGreater(teeth["total"], 0)
            self.assertIn("rotasi_derajat", teeth["items"][0]["morphology_features"])

        async def embedding_version(session):
            return await session.scalar(select(Embedding.model_version).where(Embedding.subject_id == UUID(self.pm2)))
        self.assertEqual(run_db(embedding_version), "ai_engine_v1")

        _, pm_ids = self.unprocessed_ids("post_mortem")
        self.assertFalse(set(self.pm2_imgs) & pm_ids)

    def test_03_reprocess_needs_force_and_admin_can_batch_am(self):
        status, res = self.batch([self.pm2_imgs[0]])
        if status == 202 and res["jobs"]:  # test_02 belum jalan (urutan) — selesaikan dulu
            self.wait_jobs_done([j["id"] for j in res["jobs"]])
            status, res = self.batch([self.pm2_imgs[0]])
        self.assertEqual(status, 202, res)
        self.assertEqual(res["jobs"], [])
        self.assertEqual(res["skipped"][0]["reason"], "already_processed")

        status, res = self.batch([self.pm2_imgs[0]], force=True)
        self.assertEqual(len(res["jobs"]), 1, res)
        self.assertEqual(self.wait_jobs_done([res["jobs"][0]["id"]])[0], ["completed"])

        status, res = self.batch([self.am_img], token=self.admin)
        self.assertEqual(status, 202, res)
        self.assertEqual(len(res["jobs"]), 1, res)
        self.assertEqual(self.wait_jobs_done([res["jobs"][0]["id"]])[0], ["completed"])
        _, am_ids = self.unprocessed_ids("ante_mortem")
        self.assertNotIn(self.am_img, am_ids)

    def test_04_batch_while_running_is_skipped(self):
        status, first = self.batch(self.pm_imgs)
        self.assertEqual(status, 202, first)
        self.assertEqual(len(first["jobs"]), 2)
        status, second = self.batch(self.pm_imgs)
        self.assertEqual(second["jobs"], [])
        self.assertEqual({s["reason"] for s in second["skipped"]}, {"already_running"})
        self.wait_jobs_done([j["id"] for j in first["jobs"]])

    def test_05_validation_and_rbac(self):
        self.assertEqual(self.batch(self.pm_imgs, token=self.viewer)[0], 403)
        self.assertEqual(self.batch([])[0], 422)
        self.assertEqual(self.batch([str(uuid4()) for _ in range(51)])[0], 422)
        status, _ = make_request("/api/v1/inference/batch", method="POST", data={"dental_image_ids": self.pm_imgs})
        self.assertEqual(status, 401)
        self.assertEqual(make_request("/api/v1/dental-images/unprocessed")[0], 401)

    def test_06_recover_interrupted_jobs(self):
        from api.v1.inference import recover_interrupted_jobs
        from core.database import engine

        async def insert_stale(session):
            now = datetime.now(timezone.utc)
            jobs = [
                InferenceJob(dental_image_id=UUID(self.am_img), subject_id=UUID(self.am), status=st,
                             retry_count=0, created_at=now, updated_at=now)
                for st in ("pending", "processing")
            ]
            session.add_all(jobs)
            await session.flush()
            return [j.id for j in jobs]
        stale_ids = run_db(insert_stale)

        async def recover():
            try:
                return await recover_interrupted_jobs()
            finally:
                await engine.dispose()
        self.assertGreaterEqual(asyncio.run(recover()), 2)

        for job_id in stale_ids:
            job = self.job(str(job_id))
            self.assertEqual(job["status"], "failed")
            self.assertIn("di-restart", job["error_message"])
            self.assertIsNotNone(job["completed_at"])


if __name__ == "__main__":
    unittest.main()
