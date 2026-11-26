"""
Dentify Tests — Analisis AI laporan identifikasi (narasi Agentic RAG, Pekan 14)
Live-server (DENTIFY_TEST_BASE_URL, default 127.0.0.1:8000) dengan RAG_SERVICE_BASE_URL
mengarah ke mock (scripts/mock_ai_service.py, DENTIFY_TEST_MOCK_AI_URL, default 127.0.0.1:8100).
Backend tanpa RAG dikonfigurasi → test di-skip.

1. POST /report/narrative sebelum pasangan dikonfirmasi → 409
2. Setelah confirm, GET /report → narasi 'pending' (laporan tidak menunggu RAG)
3. RAG error → 502, engine bukan 'llm' → 502, content kosong → 502; tidak ada yang tersimpan
4. Viewer membuat narasi → 200 'available' (content, referensi, engine, waktu)
5. Payload ke RAG minimal: tanpa notes/ID/staf; sudut frontal|left|right; confidence 0–1
6. Narasi tersimpan: GET /report & POST ulang memakai narasi sama tanpa memanggil RAG lagi
7. Audit GENERATE_REPORT_NARRATIVE tercatat (gagal & sukses)
8. Unit: client tanpa base URL → configured False, generate_narrative → RAGServiceError

Jalankan dari app/backend/:  python -m unittest tests.test_report_narrative -v
"""

import asyncio
import unittest
from uuid import UUID, uuid4

from sqlalchemy import delete, or_, select

from models.audit_log import AuditLog
from models.embedding import Embedding
from models.matching_result import MatchingResult
from models.tooth_record import ToothRecord
from models.view_embedding import ViewEmbedding
from tests._support import (
    MOCK_AI_URL,
    add_view_embeddings,
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

TEST_MODEL_VERSION = "test_narrative"


def unit(i: int) -> list[float]:
    v = [0.0] * 512
    v[i] = 1.0
    return v


def mock(path, method="GET", data=None):
    return make_request(path, method=method, data=data, base=MOCK_AI_URL)


class TestReportNarrative(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not service_up(MOCK_AI_URL):
            raise unittest.SkipTest(f"Mock AI/RAG tidak berjalan di {MOCK_AI_URL}")
        cls.admin = login("admin", "admin123")
        cls.viewer_user, cls.viewer = create_user(cls.admin, "viewer", "test_narr")
        suffix = uuid4().hex[:6]
        cls.case_ref = f"CASE-NARR-{suffix}"
        cls.pm = create_subject(cls.admin, "post_mortem", f"Tes Narasi PM {suffix}", cls.case_ref)
        cls.am = create_subject(cls.admin, "ante_mortem", f"Tes Narasi AM {suffix}")
        cls.subjects = [cls.pm, cls.am]

        # Catatan rahasia yang TIDAK boleh ikut terkirim ke layanan RAG
        cls.secret_note = f"CATATAN-RAHASIA-{suffix}"
        status, res = make_request(
            f"/api/v1/subjects/{cls.pm}", method="PUT",
            data={
                "subject_type": "post_mortem", "full_name": f"Tes Narasi PM {suffix}",
                "case_reference": cls.case_ref, "notes": cls.secret_note,
            },
            token=cls.admin,
        )
        assert status == 200, f"Update catatan subjek gagal: {res}"

        cls.img = {
            "pm_depan": upload_image(cls.admin, cls.pm, "depan"),
            "am_kanan": upload_image(cls.admin, cls.am, "kanan"),
            # Tanpa data gigi; hanya agar AM punya sudut yang sama dengan PM (pencocokan per sudut)
            "am_depan": upload_image(cls.admin, cls.am, "depan"),
        }
        teeth = {
            "pm_depan": [(11, 0.90, {"restoration": 1}), (21, 0.88, {"diastema": 0})],
            "am_kanan": [(11, 0.93, {"restoration": 0}), (46, 0.80, {})],
        }
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
            add_view_embeddings(session, [
                (cls.pm if key.startswith("pm") else cls.am, img, key.split("_")[1], vec)
                for key, img in cls.img.items()
            ], TEST_MODEL_VERSION)
        run_db(seed)

        status, res = make_request(
            "/api/v1/matching-results/run", method="POST", data={"pm_subject_id": cls.pm}, token=cls.admin
        )
        assert status == 200, f"Run matching gagal: {res}"
        top = res["candidates"][0]
        assert top["am_subject_id"] == cls.am, "AM uji seharusnya rank 1"
        cls.match_id = top["id"]
        cls.report_path = f"/api/v1/matching-results/{cls.match_id}/report"
        cls.narrative_path = f"{cls.report_path}/narrative"

    @classmethod
    def tearDownClass(cls):
        ids = [UUID(s) for s in cls.subjects]
        image_ids = [UUID(i["id"]) for i in cls.img.values()]

        async def cleanup(session):
            await session.execute(delete(MatchingResult).where(
                or_(MatchingResult.pm_subject_id.in_(ids), MatchingResult.am_subject_id.in_(ids))
            ))
            await session.execute(delete(Embedding).where(Embedding.subject_id.in_(ids)))
            await session.execute(delete(ViewEmbedding).where(ViewEmbedding.subject_id.in_(ids)))
            await session.execute(delete(ToothRecord).where(ToothRecord.dental_image_id.in_(image_ids)))
        run_db(cleanup)
        for sid in cls.subjects:
            make_request(f"/api/v1/subjects/{sid}", method="DELETE", token=cls.admin)
        deactivate_user(cls.admin, cls.viewer_user)

    def rag_calls(self) -> int:
        return mock(f"/mock/reports/{self.match_id}")[1]["calls"]

    def stored_narrative(self):
        async def op(session):
            return await session.scalar(
                select(MatchingResult.report_narrative).where(MatchingResult.id == UUID(self.match_id))
            )
        return run_db(op)

    def test_01_requires_confirmation(self):
        status, res = make_request(self.narrative_path, method="POST", token=self.viewer)
        self.assertEqual(status, 409, res)
        self.assertEqual(self.rag_calls(), 0)

    def test_02_report_is_pending_after_confirm(self):
        status, res = make_request(
            f"/api/v1/matching-results/{self.match_id}/confirm", method="POST",
            data={"decision": "confirmed"}, token=self.admin,
        )
        self.assertEqual(status, 200, res)
        status, report = make_request(self.report_path, token=self.viewer)
        self.assertEqual(status, 200, report)
        if report["narrative"]["status"] == "not_available":
            self.skipTest("Backend uji tanpa RAG_SERVICE_BASE_URL")
        self.assertEqual(report["narrative"]["status"], "pending")
        self.assertIsNone(report["narrative"]["content"])
        self.assertEqual(self.rag_calls(), 0, "GET /report tidak boleh memanggil RAG")

    def test_03_failures_are_not_stored(self):
        for mode, needle in (("error", "HTTP 500"), ("no_llm", "engine: template"), ("empty", "tidak mengembalikan")):
            with self.subTest(mode=mode):
                mock("/mock/reports/next", method="POST", data={"mode": mode})
                status, res = make_request(self.narrative_path, method="POST", token=self.viewer)
                self.assertEqual(status, 502, res)
                self.assertIn(needle, res["detail"])
                self.assertNotIn("100.", res["detail"])  # URL layanan tidak bocor ke pengguna
                self.assertIsNone(self.stored_narrative())
        self.assertEqual(self.rag_calls(), 3)
        status, report = make_request(self.report_path, token=self.viewer)
        self.assertEqual(report["narrative"]["status"], "pending")

    def test_04_viewer_generates_narrative(self):
        status, res = make_request(self.narrative_path, method="POST", token=self.viewer)
        self.assertEqual(status, 200, res)
        self.assertEqual(res["status"], "available")
        self.assertIn("Ringkasan Temuan", res["content"])
        self.assertIn(self.case_ref, res["content"])
        self.assertEqual(res["engine"], "llm")
        self.assertEqual(res["model_version"], "mock-qwen + mock-bge-m3")
        self.assertEqual(
            res["references"][0],
            {"n": 1, "source": "DVI_DVI Guide 2023.pdf", "page": 12, "section": "Odontology", "score": 0.87},
        )
        self.assertIsNotNone(res["generated_at"])
        self.__class__.narrative = res

    def test_05_payload_is_minimal(self):
        payload = mock(f"/mock/reports/{self.match_id}")[1]["last_payload"]
        self.assertEqual(payload["matching_result_id"], self.match_id)
        for side in ("pm_subject", "am_subject"):
            self.assertEqual(set(payload[side]), {"subject_type", "full_name", "case_reference"})
        self.assertEqual(payload["pm_subject"]["subject_type"], "post_mortem")
        self.assertEqual(payload["pm_subject"]["case_reference"], self.case_ref)
        raw = str(payload)
        self.assertNotIn(self.secret_note, raw)
        self.assertNotIn("created_by", raw)
        self.assertNotIn("admin", raw)
        self.assertNotIn(self.pm, raw)  # ID internal subjek

        self.assertAlmostEqual(payload["scores"]["confidence_score"], 1.0, places=3)  # 0–1, bukan persen
        self.assertEqual(payload["scores"]["rank"], 1)
        self.assertEqual(
            set(payload["comparison"]["summary"]),
            {"consistent", "discrepant", "pm_only", "am_only", "features_compared", "features_different"},
        )
        teeth = {t["fdi_number"]: t for t in payload["comparison"]["teeth"]}
        self.assertEqual(sorted(teeth), [11, 21, 46])
        self.assertEqual(teeth[11]["status"], "discrepant")
        self.assertEqual(teeth[11]["pm"], {"views": ["frontal"]})
        self.assertEqual(teeth[11]["am"], {"views": ["right"]})
        self.assertEqual(
            teeth[11]["features"],
            [{"feature": "restoration", "pm": 1, "am": 0, "status": "different"}],
        )
        self.assertIsNone(teeth[21]["am"])
        self.assertEqual(teeth[46]["status"], "am_only")

    def test_06_narrative_is_reused(self):
        calls = self.rag_calls()
        status, report = make_request(self.report_path, token=self.admin)
        self.assertEqual(status, 200, report)
        self.assertEqual(report["narrative"], self.narrative)
        status, again = make_request(self.narrative_path, method="POST", token=self.admin)
        self.assertEqual(status, 200, again)
        self.assertEqual(again, self.narrative)
        self.assertEqual(self.rag_calls(), calls, "Narasi tersimpan tidak boleh dibuat ulang")

    def test_07_audit_logged(self):
        async def details(session):
            rows = await session.scalars(select(AuditLog.details).where(
                AuditLog.action == "GENERATE_REPORT_NARRATIVE", AuditLog.resource_id == UUID(self.match_id)
            ))
            return [d for d in rows if d]
        # 3 gagal (test_03) + 1 dibuat (test_04) + 1 dari simpanan (test_06); 409 test_01 bukan aksi ini
        logged = wait_until(lambda: (lambda r: r if len(r) >= 5 else None)(run_db(details)), timeout=5)
        self.assertIsNotNone(logged, "Audit GENERATE_REPORT_NARRATIVE kurang dari 5 entri")
        statuses = [d.get("narrative") for d in logged]
        self.assertEqual(statuses.count("failed"), 3)
        self.assertEqual(statuses.count("available"), 2)
        self.assertEqual(sum(1 for d in logged if d.get("engine") == "llm" and d.get("cached") is False), 1)
        self.assertEqual(sum(1 for d in logged if d.get("cached") is True), 1)

    def test_08_client_not_configured(self):
        from services.rag_service_client import RAGServiceClient, RAGServiceError

        client = RAGServiceClient()
        client.base_url = ""
        self.assertFalse(client.configured)
        with self.assertRaises(RAGServiceError):
            asyncio.run(client.generate_narrative({"matching_result_id": "x"}))


if __name__ == "__main__":
    unittest.main()
