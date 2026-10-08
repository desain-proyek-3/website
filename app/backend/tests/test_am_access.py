"""
Dentify Tests — Ante-Mortem (AM) Admin-Only Access
Data AM (subjek, citra, inferensi) hanya boleh dikelola admin; data PM tetap
untuk admin & examiner; membaca tetap untuk semua role. Diuji terhadap server
live (127.0.0.1:8000) dengan akun examiner sementara:
1. Examiner: buat subjek AM → 403; buat subjek PM → 201
2. Examiner: ubah subjek PM menjadi AM → 403; ubah/hapus subjek AM → 403
3. Examiner: upload citra ke subjek AM → 403; hapus citra AM → 403
4. Examiner: trigger inferensi pada citra AM → 403
5. Examiner tetap bisa membaca subjek & citra AM (200)
6. Admin: semua operasi AM di atas diizinkan
7. Hapus subjek (soft-delete) ikut men-soft-delete seluruh citra aktifnya

Data test di-soft-delete dan akun examiner dinonaktifkan di tearDownClass.
"""

import json
import unittest
import urllib.error
import urllib.request
from uuid import uuid4

BASE_URL = "http://127.0.0.1:8000"
DUMMY_JPEG = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xFF\xDB\x00C\x00\xFF\xD9"
AM_DETAIL = "Data ante-mortem hanya dapat dikelola oleh admin"


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
    boundary = "----DentifyAmAccessTestBoundary"
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


def subject_payload(subject_type: str, name: str) -> dict:
    return {"subject_type": subject_type, "full_name": name, "case_reference": None, "notes": None}


class TestAnteMortemAdminOnly(unittest.TestCase):
    subjects: list[str] = []
    images: list[str] = []

    @classmethod
    def setUpClass(cls):
        status, res = make_request(
            "/api/v1/auth/login", method="POST", data={"username": "admin", "password": "admin123"}
        )
        assert status == 200, f"Login admin gagal: {res}"
        cls.admin = res["access_token"]

        suffix = uuid4().hex[:6]
        password = "examiner-123"
        status, res = make_request(
            "/api/v1/users",
            method="POST",
            data={
                "username": f"test_am_examiner_{suffix}",
                "email": f"am.examiner.{suffix}@dentify.test",
                "full_name": "AM Access Examiner",
                "role": "examiner",
                "password": password,
            },
            token=cls.admin,
        )
        assert status == 201, f"Pembuatan examiner gagal: {res}"
        cls.examiner_user = res
        status, res = make_request(
            "/api/v1/auth/login",
            method="POST",
            data={"username": cls.examiner_user["username"], "password": password},
        )
        assert status == 200, f"Login examiner gagal: {res}"
        cls.examiner = res["access_token"]

        # Subjek AM + citra milik admin, subjek PM milik examiner
        status, res = make_request(
            "/api/v1/subjects", method="POST",
            data=subject_payload("ante_mortem", f"Subjek Tes AM Access {suffix}"), token=cls.admin,
        )
        assert status == 201, f"Admin gagal membuat subjek AM: {res}"
        cls.am_subject = res
        cls.subjects.append(res["id"])

        status, res = upload_image(cls.admin, cls.am_subject["id"], "depan")
        assert status == 201, f"Admin gagal upload citra AM: {res}"
        cls.am_image_id = res["id"]
        cls.images.append(res["id"])

    @classmethod
    def tearDownClass(cls):
        for image_id in cls.images:
            make_request(f"/api/v1/dental-images/{image_id}", method="DELETE", token=cls.admin)
        for subject_id in cls.subjects:
            make_request(f"/api/v1/subjects/{subject_id}", method="DELETE", token=cls.admin)
        u = cls.examiner_user
        make_request(
            f"/api/v1/users/{u['id']}",
            method="PUT",
            data={"email": u["email"], "full_name": u["full_name"], "role": "examiner", "is_active": False},
            token=cls.admin,
        )

    def assertAmForbidden(self, result: tuple[int, dict]) -> None:
        status, res = result
        self.assertEqual(status, 403, res)
        self.assertEqual(res.get("detail"), AM_DETAIL)

    def test_01_examiner_cannot_create_am_but_can_create_pm(self):
        self.assertAmForbidden(make_request(
            "/api/v1/subjects", method="POST",
            data=subject_payload("ante_mortem", "Tidak boleh"), token=self.examiner,
        ))
        status, res = make_request(
            "/api/v1/subjects", method="POST",
            data=subject_payload("post_mortem", "Subjek Tes AM Access PM"), token=self.examiner,
        )
        self.assertEqual(status, 201, res)
        self.subjects.append(res["id"])
        TestAnteMortemAdminOnly.pm_subject = res

    def test_02_examiner_cannot_convert_or_modify_am_subject(self):
        pm = self.pm_subject
        self.assertAmForbidden(make_request(
            f"/api/v1/subjects/{pm['id']}", method="PUT",
            data=subject_payload("ante_mortem", pm["full_name"]), token=self.examiner,
        ))
        am = self.am_subject
        self.assertAmForbidden(make_request(
            f"/api/v1/subjects/{am['id']}", method="PUT",
            data=subject_payload("ante_mortem", "Ubah nama"), token=self.examiner,
        ))
        self.assertAmForbidden(make_request(
            f"/api/v1/subjects/{am['id']}", method="PUT",
            data=subject_payload("post_mortem", am["full_name"]), token=self.examiner,
        ))
        self.assertAmForbidden(make_request(f"/api/v1/subjects/{am['id']}", method="DELETE", token=self.examiner))

    def test_03_examiner_cannot_upload_or_delete_am_image(self):
        self.assertAmForbidden(upload_image(self.examiner, self.am_subject["id"], "kiri"))
        self.assertAmForbidden(
            make_request(f"/api/v1/dental-images/{self.am_image_id}", method="DELETE", token=self.examiner)
        )

    def test_04_examiner_cannot_trigger_inference_on_am_image(self):
        self.assertAmForbidden(make_request(
            "/api/v1/inference/trigger", method="POST",
            data={"dental_image_id": self.am_image_id}, token=self.examiner,
        ))

    def test_05_examiner_can_still_read_am_data(self):
        status, _ = make_request(f"/api/v1/subjects/{self.am_subject['id']}", token=self.examiner)
        self.assertEqual(status, 200)
        status, res = make_request(f"/api/v1/subjects/{self.am_subject['id']}/images", token=self.examiner)
        self.assertEqual(status, 200)
        self.assertEqual(res["total"], 1)
        status, _ = make_request(f"/api/v1/dental-images/{self.am_image_id}/tooth-records", token=self.examiner)
        self.assertEqual(status, 200)

    def test_06_admin_can_manage_am_data(self):
        am = self.am_subject
        status, res = make_request(
            f"/api/v1/subjects/{am['id']}", method="PUT",
            data={**subject_payload("ante_mortem", am["full_name"]), "notes": "Sumber: klinik"}, token=self.admin,
        )
        self.assertEqual(status, 200, res)

        status, res = upload_image(self.admin, am["id"], "kanan")
        self.assertEqual(status, 201, res)
        self.images.append(res["id"])

        status, res = make_request(
            "/api/v1/inference/trigger", method="POST",
            data={"dental_image_id": self.am_image_id}, token=self.admin,
        )
        self.assertEqual(status, 202, res)

    def test_07_admin_delete_subject_soft_deletes_its_images(self):
        status, res = make_request(
            "/api/v1/subjects", method="POST",
            data=subject_payload("ante_mortem", "Subjek Tes AM Access Delete"), token=self.admin,
        )
        self.assertEqual(status, 201, res)
        subject_id = res["id"]
        self.subjects.append(subject_id)
        image_ids = []
        for view in ("depan", "kiri"):
            status, res = upload_image(self.admin, subject_id, view)
            self.assertEqual(status, 201, res)
            image_ids.append(res["id"])

        status, res = make_request(f"/api/v1/subjects/{subject_id}", method="DELETE", token=self.admin)
        self.assertEqual(status, 200, res)
        self.assertTrue(res["is_deleted"])

        for image_id in image_ids:
            status, _ = make_request(f"/api/v1/dental-images/{image_id}", token=self.admin)
            self.assertEqual(status, 404)
        status, _ = make_request(f"/api/v1/subjects/{subject_id}", token=self.admin)
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
