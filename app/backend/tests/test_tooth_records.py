"""
Dentify Tests — Tooth Records API Integration Tests
Menguji GET /api/v1/dental-images/{id}/tooth-records terhadap server live (127.0.0.1:8000):
1. Citra yang belum diproses AI → 200 dengan daftar kosong
2. Dapat diakses role viewer (read-only)
3. 404 untuk citra tidak dikenal dan citra yang sudah di-soft-delete
4. 401 tanpa token

Jalur dengan data terisi bergantung pada hasil AI service, jadi diuji lewat
E2E dengan mock AI, bukan di sini.

Data test di-soft-delete dan user viewer test dinonaktifkan di tearDownClass.
"""

import json
import unittest
import urllib.error
import urllib.request
from uuid import uuid4

BASE_URL = "http://127.0.0.1:8000"
DUMMY_JPEG = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xFF\xDB\x00C\x00\xFF\xD9"


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


def upload_image(token: str, subject_id: str, view_type: str) -> tuple[int, dict]:
    boundary = "----DentifyToothRecordsTestBoundary"
    body = bytearray()
    for key, value in {"subject_id": subject_id, "view_type": view_type}.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
    body += (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="t.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode()
    body += DUMMY_JPEG + f"\r\n--{boundary}--\r\n".encode()
    return make_request(
        "/api/v1/dental-images/upload",
        method="POST",
        data=bytes(body),
        content_type=f"multipart/form-data; boundary={boundary}",
        token=token,
    )


class TestToothRecordsAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        status, res = make_request(
            "/api/v1/auth/login", method="POST", data={"username": "admin", "password": "admin123"}
        )
        assert status == 200, f"Login admin gagal: {res}"
        cls.token = res["access_token"]

        status, res = make_request(
            "/api/v1/subjects",
            method="POST",
            data={"subject_type": "post_mortem", "full_name": f"Subjek Tes ToothRecords {uuid4().hex[:6]}"},
            token=cls.token,
        )
        assert status == 201, f"Pembuatan subjek gagal: {res}"
        cls.subject_id = res["id"]

        status, res = upload_image(cls.token, cls.subject_id, "depan")
        assert status == 201, f"Upload citra gagal: {res}"
        cls.image_id = res["id"]

        status, res = upload_image(cls.token, cls.subject_id, "kiri")
        assert status == 201, f"Upload citra kiri gagal: {res}"
        cls.deleted_image_id = res["id"]
        status, _ = make_request(f"/api/v1/dental-images/{cls.deleted_image_id}", method="DELETE", token=cls.token)
        assert status == 200, "Soft-delete citra kiri gagal"

        # Akun viewer sementara untuk menguji akses read-only
        suffix = uuid4().hex[:6]
        cls.viewer_password = "viewer-test-123"
        status, res = make_request(
            "/api/v1/users",
            method="POST",
            data={
                "username": f"test_viewer_{suffix}",
                "email": f"viewer.{suffix}@dentify.test",
                "full_name": "Viewer Test",
                "role": "viewer",
                "password": cls.viewer_password,
            },
            token=cls.token,
        )
        assert status == 201, f"Pembuatan viewer gagal: {res}"
        cls.viewer = res

    @classmethod
    def tearDownClass(cls):
        make_request(f"/api/v1/dental-images/{cls.image_id}", method="DELETE", token=cls.token)
        make_request(f"/api/v1/subjects/{cls.subject_id}", method="DELETE", token=cls.token)
        v = cls.viewer
        make_request(
            f"/api/v1/users/{v['id']}",
            method="PUT",
            data={"email": v["email"], "full_name": v["full_name"], "role": "viewer", "is_active": False},
            token=cls.token,
        )

    def test_01_unprocessed_image_returns_empty_list(self):
        status, res = make_request(f"/api/v1/dental-images/{self.image_id}/tooth-records", token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(res, {"items": [], "total": 0})

    def test_02_viewer_can_read(self):
        status, res = make_request(
            "/api/v1/auth/login",
            method="POST",
            data={"username": self.viewer["username"], "password": self.viewer_password},
        )
        self.assertEqual(status, 200)
        status, _ = make_request(
            f"/api/v1/dental-images/{self.image_id}/tooth-records", token=res["access_token"]
        )
        self.assertEqual(status, 200)

    def test_03_not_found_and_soft_deleted(self):
        status, res = make_request(f"/api/v1/dental-images/{uuid4()}/tooth-records", token=self.token)
        self.assertEqual(status, 404)
        self.assertIn("tidak ditemukan", res.get("detail", ""))
        status, res = make_request(
            f"/api/v1/dental-images/{self.deleted_image_id}/tooth-records", token=self.token
        )
        self.assertEqual(status, 404)
        self.assertIn("dihapus", res.get("detail", ""))

    def test_04_unauthorized(self):
        status, _ = make_request(f"/api/v1/dental-images/{self.image_id}/tooth-records")
        self.assertEqual(status, 401)


if __name__ == "__main__":
    unittest.main()
