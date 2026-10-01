"""
Dentify Tests — Inference API Unit & Integration Tests
Menguji alur inference jobs:
1. POST /api/v1/inference/trigger (202 Accepted) dengan dental_image_id valid
2. GET /api/v1/inference/jobs/{job_id} (200 OK)
3. 404 ketika job_id tidak ditemukan
4. 404 ketika dental_image_id tidak ditemukan
5. 404 ketika mencoba mentrigger inferensi pada dental_image yang sudah soft-deleted
6. Proteksi autentikasi (401 Unauthorized tanpa token)
"""

import json
import unittest
import urllib.error
import urllib.request
from uuid import uuid4

BASE_URL = "http://127.0.0.1:8000"


def make_request(
    path: str,
    method: str = "GET",
    data: bytes | dict | None = None,
    content_type: str = "application/json",
    token: str | None = None,
) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}"
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = None
    if data is not None:
        if isinstance(data, dict):
            body = json.dumps(data).encode("utf-8")
        elif isinstance(data, (bytes, bytearray)):
            body = bytes(data)

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
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


def build_multipart(
    fields: dict, files: dict, boundary: str = "----DentifyInferenceTestBoundary"
) -> tuple[bytes, str]:
    body = bytearray()
    for key, value in fields.items():
        if value is not None:
            body.extend(f"--{boundary}\r\n".encode())
            body.extend(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
            body.extend(f"{value}\r\n".encode())
    for key, (filename, content, content_type) in files.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{key}"; filename="{filename}"\r\n'.encode())
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode())
        body.extend(content)
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())
    return bytes(body), f"multipart/form-data; boundary={boundary}"


class TestInferenceJobsAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # 1. Login sebagai admin
        status, res = make_request(
            "/api/v1/auth/login",
            method="POST",
            data={"username": "admin", "password": "admin123"},
        )
        assert status == 200, f"Login admin gagal: {res}"
        cls.token = res["access_token"]

        # 2. Buat subjek tes
        status, res = make_request(
            "/api/v1/subjects",
            method="POST",
            data={
                "subject_type": "ante_mortem",
                "full_name": f"Subjek Tes Inference {uuid4().hex[:6]}",
                "case_reference": f"CASE-INF-{uuid4().hex[:4]}",
                "notes": "Data subjek untuk pengujian inference_jobs",
            },
            token=cls.token,
        )
        assert status == 201, f"Pembuatan subjek gagal: {res}"
        cls.subject_id = res["id"]

        # 3. Upload citra aktif (depan)
        dummy_jpeg = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xFF\xDB\x00C\x00\xFF\xD9"
        fields = {
            "subject_id": cls.subject_id,
            "view_type": "depan",
            "device_id": "SCANNER-TEST-INF",
        }
        files = {
            "file": ("intraoral_test.jpg", dummy_jpeg, "image/jpeg")
        }
        body, content_type = build_multipart(fields, files)
        status, res = make_request(
            "/api/v1/dental-images/upload",
            method="POST",
            data=body,
            content_type=content_type,
            token=cls.token,
        )
        assert status == 201, f"Upload citra dental gagal: {res}"
        cls.dental_image_id = res["id"]

        # 4. Upload citra kedua (kiri) untuk pengujian soft-delete
        fields_kiri = {
            "subject_id": cls.subject_id,
            "view_type": "kiri",
            "device_id": "SCANNER-TEST-INF",
        }
        files_kiri = {
            "file": ("intraoral_test_kiri.jpg", dummy_jpeg, "image/jpeg")
        }
        body_kiri, content_type_kiri = build_multipart(fields_kiri, files_kiri)
        status, res = make_request(
            "/api/v1/dental-images/upload",
            method="POST",
            data=body_kiri,
            content_type=content_type_kiri,
            token=cls.token,
        )
        assert status == 201, f"Upload citra kiri gagal: {res}"
        cls.deleted_image_id = res["id"]

        # Soft-delete citra kedua
        status, _ = make_request(
            f"/api/v1/dental-images/{cls.deleted_image_id}",
            method="DELETE",
            token=cls.token,
        )
        assert status == 200, "Soft-delete citra kiri gagal"

    def test_01_trigger_inference_success(self):
        """POST /api/v1/inference/trigger dengan dental_image_id valid harus return 202 Accepted."""
        payload = {"dental_image_id": self.dental_image_id}
        status, res = make_request(
            "/api/v1/inference/trigger",
            method="POST",
            data=payload,
            token=self.token,
        )
        self.assertEqual(status, 202)
        self.assertIn("id", res)
        self.assertEqual(res["dental_image_id"], self.dental_image_id)
        self.assertEqual(res["subject_id"], self.subject_id)
        self.assertIn(res["status"], ["pending", "processing", "completed", "failed"])
        self.assertIn("created_at", res)
        self.assertIn("updated_at", res)

        # Simpan job_id untuk pengujian GET
        TestInferenceJobsAPI.created_job_id = res["id"]

    def test_02_get_inference_job_by_id(self):
        """GET /api/v1/inference/jobs/{job_id} harus return 200 dan detail job."""
        job_id = getattr(self, "created_job_id", None)
        self.assertIsNotNone(job_id, "test_01 harus berjalan terlebih dahulu")

        status, res = make_request(
            f"/api/v1/inference/jobs/{job_id}",
            method="GET",
            token=self.token,
        )
        self.assertEqual(status, 200)
        self.assertEqual(res["id"], job_id)
        self.assertEqual(res["dental_image_id"], self.dental_image_id)
        self.assertEqual(res["subject_id"], self.subject_id)
        self.assertIn("status", res)
        self.assertIn("retry_count", res)

    def test_03_get_job_not_found(self):
        """GET /api/v1/inference/jobs/{job_id} untuk ID acak harus return 404."""
        random_id = str(uuid4())
        status, res = make_request(
            f"/api/v1/inference/jobs/{random_id}",
            method="GET",
            token=self.token,
        )
        self.assertEqual(status, 404)
        self.assertIn("tidak ditemukan", res.get("detail", ""))

    def test_04_trigger_image_not_found(self):
        """POST /api/v1/inference/trigger dengan image ID acak harus return 404."""
        payload = {"dental_image_id": str(uuid4())}
        status, res = make_request(
            "/api/v1/inference/trigger",
            method="POST",
            data=payload,
            token=self.token,
        )
        self.assertEqual(status, 404)
        self.assertIn("tidak ditemukan", res.get("detail", ""))

    def test_05_trigger_soft_deleted_image(self):
        """POST /api/v1/inference/trigger untuk citra yang sudah di-soft-delete harus return 404."""
        payload = {"dental_image_id": self.deleted_image_id}
        status, res = make_request(
            "/api/v1/inference/trigger",
            method="POST",
            data=payload,
            token=self.token,
        )
        self.assertEqual(status, 404)
        self.assertIn("dihapus", res.get("detail", ""))

    def test_06_unauthorized_access(self):
        """Endpoint /inference harus mengembalikan 401 jika dipanggil tanpa token."""
        # Trigger tanpa token
        status, _ = make_request(
            "/api/v1/inference/trigger",
            method="POST",
            data={"dental_image_id": self.dental_image_id},
        )
        self.assertEqual(status, 401)

        # Get status tanpa token
        status, _ = make_request(
            f"/api/v1/inference/jobs/{uuid4()}",
            method="GET",
        )
        self.assertEqual(status, 401)


if __name__ == "__main__":
    unittest.main()
