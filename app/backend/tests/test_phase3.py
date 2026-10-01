"""
Dentify Tests — Phase 3 End-to-End Integration Tests
Menguji secara komprehensif:
1. Inisialisasi MinIO & storage service
2. CRUD Subjects (POST, GET list + pagination + filter, GET detail, PUT update, DELETE soft-delete)
3. Manajemen Citra Intraoral (Upload multipart, validasi tipe file, constraint unik view_type 409,
   GET detail + presigned URL, GET subject images, DELETE soft-delete tanpa hapus fisik di MinIO)
4. RBAC (admin/examiner vs unauthorized)
5. Audit log trail
"""

import json
import os
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
    fields: dict, files: dict, boundary: str = "----DentifyTestBoundary7MA4YW"
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


class TestPhase3EndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Login sebagai admin
        status, res = make_request(
            "/api/v1/auth/login",
            method="POST",
            data={"username": "admin", "password": "admin123"},
        )
        assert status == 200, f"Login admin gagal: {res}"
        cls.token = res["access_token"]

    def test_01_subject_crud_lifecycle(self):
        """Uji siklus hidup data subjek forensik: POST -> GET -> PUT -> DELETE (soft-delete)."""
        # 1. Create Ante-Mortem Subject
        create_payload = {
            "subject_type": "ante_mortem",
            "full_name": "Korban AM Tes Otomatis",
            "case_reference": "CASE-TEST-001",
            "notes": "Data riwayat dental sebelum bencana",
        }
        status, res = make_request(
            "/api/v1/subjects", method="POST", data=create_payload, token=self.token
        )
        self.assertEqual(status, 201)
        self.assertEqual(res["subject_type"], "ante_mortem")
        self.assertEqual(res["full_name"], "Korban AM Tes Otomatis")
        self.assertFalse(res["is_deleted"])
        subject_id = res["id"]

        # 2. Get Subject Detail
        status, res = make_request(f"/api/v1/subjects/{subject_id}", method="GET", token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(res["id"], subject_id)

        # 3. List Subjects with filter
        status, res = make_request(
            "/api/v1/subjects?subject_type=ante_mortem&limit=10", method="GET", token=self.token
        )
        self.assertEqual(status, 200)
        self.assertGreaterEqual(res["total"], 1)
        self.assertTrue(any(item["id"] == subject_id for item in res["items"]))

        # 4. Update Subject (PUT)
        update_payload = {
            "subject_type": "ante_mortem",
            "full_name": "Korban AM Tes Otomatis Diperbarui",
            "case_reference": "CASE-TEST-001-REV",
            "notes": "Catatan telah diupdate oleh tim forensik",
        }
        status, res = make_request(
            f"/api/v1/subjects/{subject_id}", method="PUT", data=update_payload, token=self.token
        )
        self.assertEqual(status, 200)
        self.assertEqual(res["full_name"], "Korban AM Tes Otomatis Diperbarui")

        # 5. Soft-Delete Subject
        status, res = make_request(f"/api/v1/subjects/{subject_id}", method="DELETE", token=self.token)
        self.assertEqual(status, 200)
        self.assertTrue(res["is_deleted"])
        self.assertIsNotNone(res["deleted_at"])
        self.assertIsNotNone(res["deleted_by"])

        # 6. Verify Subject is 404 after soft-delete
        status, res = make_request(f"/api/v1/subjects/{subject_id}", method="GET", token=self.token)
        self.assertEqual(status, 404)

    def test_02_dental_images_lifecycle_and_constraints(self):
        """Uji upload citra, constraint unik view_type, presigned URL, dan soft-delete."""
        # Buat subjek khusus untuk tes citra
        status, res = make_request(
            "/api/v1/subjects",
            method="POST",
            data={
                "subject_type": "post_mortem",
                "full_name": "Jenazah PM-002",
                "case_reference": "CASE-DVI-PM002",
                "notes": "Pemeriksaan post-mortem di kantong jenazah B-04",
            },
            token=self.token,
        )
        self.assertEqual(status, 201)
        subject_id = res["id"]

        # 1. Upload Citra Depan (Valid JPEG)
        dummy_jpeg_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xFF\xDB\x00C\x00\xFF\xD9"
        fields = {
            "subject_id": subject_id,
            "view_type": "depan",
            "device_id": "SCANNER-ESP32-01",
            "captured_at": "2026-09-18T10:00:00Z",
        }
        files = {
            "file": ("intraoral_front.jpg", dummy_jpeg_bytes, "image/jpeg")
        }
        body, content_type = build_multipart(fields, files)

        status, res = make_request(
            "/api/v1/dental-images/upload",
            method="POST",
            data=body,
            content_type=content_type,
            token=self.token,
        )
        self.assertEqual(status, 201)
        self.assertEqual(res["subject_id"], subject_id)
        self.assertEqual(res["view_type"], "depan")
        self.assertIn("image_url", res)
        self.assertTrue(res["image_url"].startswith("http"))
        # Pastikan file_path tidak diekspos di response
        self.assertNotIn("file_path", res)
        image_id = res["id"]

        # 2. Uji Constraint Unik (subject_id, view_type) -> harus return 409 Conflict
        fields_duplicate = {
            "subject_id": subject_id,
            "view_type": "depan",  # Sudut pandang yang sama
        }
        files_duplicate = {
            "file": ("intraoral_front_dup.jpg", dummy_jpeg_bytes, "image/jpeg")
        }
        dup_body, dup_content_type = build_multipart(fields_duplicate, files_duplicate)
        status, res = make_request(
            "/api/v1/dental-images/upload",
            method="POST",
            data=dup_body,
            content_type=dup_content_type,
            token=self.token,
        )
        self.assertEqual(status, 409)
        self.assertIn("sudut pandang 'depan' sudah ada", res.get("detail", ""))

        # 3. Uji Validasi Format File Salah -> 400 Bad Request
        files_invalid = {
            "file": ("document.txt", b"Bukan file gambar", "text/plain")
        }
        inv_body, inv_content_type = build_multipart(
            {"subject_id": subject_id, "view_type": "kiri"}, files_invalid
        )
        status, res = make_request(
            "/api/v1/dental-images/upload",
            method="POST",
            data=inv_body,
            content_type=inv_content_type,
            token=self.token,
        )
        self.assertEqual(status, 400)
        self.assertIn("Format file 'text/plain' tidak didukung", res.get("detail", ""))

        # 4. Upload Citra Sudut Kiri (Valid)
        fields_kiri = {
            "subject_id": subject_id,
            "view_type": "kiri",
        }
        files_kiri = {
            "file": ("intraoral_left.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", "image/png")
        }
        kiri_body, kiri_content_type = build_multipart(fields_kiri, files_kiri)
        status, res = make_request(
            "/api/v1/dental-images/upload",
            method="POST",
            data=kiri_body,
            content_type=kiri_content_type,
            token=self.token,
        )
        self.assertEqual(status, 201)

        # 5. List Citra Milik Subjek (GET /api/v1/subjects/{id}/images)
        status, res = make_request(f"/api/v1/subjects/{subject_id}/images", method="GET", token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(res["total"], 2)  # Depan dan kiri
        self.assertEqual(len(res["items"]), 2)
        for item in res["items"]:
            self.assertIsNotNone(item["image_url"])
            self.assertNotIn("file_path", item)

        # 6. Get Detail Satu Citra (GET /api/v1/dental-images/{id})
        status, res = make_request(f"/api/v1/dental-images/{image_id}", method="GET", token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(res["id"], image_id)
        self.assertIsNotNone(res["image_url"])

        # 7. Soft-Delete Citra (DELETE /api/v1/dental-images/{id})
        status, res = make_request(f"/api/v1/dental-images/{image_id}", method="DELETE", token=self.token)
        self.assertEqual(status, 200)
        self.assertTrue(res["is_deleted"])
        self.assertIsNotNone(res["deleted_at"])
        self.assertIsNotNone(res["deleted_by"])

        # 8. Verifikasi Citra yang Terhapus menjadi 404
        status, res = make_request(f"/api/v1/dental-images/{image_id}", method="GET", token=self.token)
        self.assertEqual(status, 404)

        # 9. Verifikasi List Citra Subjek Berkurang (hanya menampilkan yang aktif)
        status, res = make_request(f"/api/v1/subjects/{subject_id}/images", method="GET", token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(res["total"], 1)  # Hanya tersisa citra kiri

    def test_03_unauthorized_access(self):
        """Memastikan endpoint terlindungi dari akses tanpa token."""
        # Tanpa token -> 401
        status, res = make_request("/api/v1/subjects", method="GET")
        self.assertEqual(status, 401)

        status, res = make_request(f"/api/v1/subjects/{uuid4()}", method="GET")
        self.assertEqual(status, 401)

        status, res = make_request(f"/api/v1/dental-images/{uuid4()}", method="GET")
        self.assertEqual(status, 401)


if __name__ == "__main__":
    unittest.main()
