"""
Dentify Tests — User Management API Integration Tests
Menguji endpoint admin-only /api/v1/users terhadap server live (127.0.0.1:8000):
1. Admin dapat melihat daftar user
2. Admin membuat user baru (201), response tanpa password
3. 409 untuk username/email duplikat (email case-insensitive)
4. 422 untuk email tidak valid / password terlalu pendek
5. Non-admin (examiner) ditolak 403
6. PUT: ubah role + reset password berlaku saat login berikutnya
7. Nonaktifkan user: login ditolak & token lama langsung 401
8. Admin tidak dapat menonaktifkan / menurunkan role dirinya sendiri (400)
9. 404 untuk user tidak dikenal, 401 tanpa token

User test dinonaktifkan di tearDownClass (tidak ada endpoint DELETE —
row user tetap ada demi jejak audit).
"""

import json
import unittest
import urllib.error
import urllib.request
from uuid import uuid4

BASE_URL = "http://127.0.0.1:8000"
PASSWORD = "rahasia-123"


def make_request(
    path: str,
    method: str = "GET",
    data: dict | None = None,
    token: str | None = None,
) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"} if data is not None else {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
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


def login(username: str, password: str) -> tuple[int, dict]:
    return make_request(
        "/api/v1/auth/login", method="POST", data={"username": username, "password": password}
    )


class TestUsersAPI(unittest.TestCase):
    created: list[dict] = []

    @classmethod
    def setUpClass(cls):
        status, res = login("admin", "admin123")
        assert status == 200, f"Login admin gagal: {res}"
        cls.token = res["access_token"]
        _, me = make_request("/api/v1/auth/me", token=cls.token)
        cls.admin_id = me["id"]

        cls.suffix = uuid4().hex[:6]
        status, res = make_request(
            "/api/v1/users",
            method="POST",
            data={
                "username": f"test_examiner_{cls.suffix}",
                "email": f"Examiner.{cls.suffix}@Dentify.test",
                "full_name": "Examiner Test",
                "role": "examiner",
                "password": PASSWORD,
            },
            token=cls.token,
        )
        assert status == 201, f"Pembuatan user gagal: {res}"
        cls.examiner = res
        cls.created.append(res)

    @classmethod
    def tearDownClass(cls):
        for u in cls.created:
            make_request(
                f"/api/v1/users/{u['id']}",
                method="PUT",
                data={
                    "email": u["email"],
                    "full_name": u["full_name"],
                    "role": "viewer",
                    "is_active": False,
                },
                token=cls.token,
            )

    def _put(self, user: dict, **changes) -> tuple[int, dict]:
        data = {
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "is_active": user["is_active"],
            **changes,
        }
        return make_request(f"/api/v1/users/{user['id']}", method="PUT", data=data, token=self.token)

    def test_01_list_users_as_admin(self):
        status, res = make_request("/api/v1/users?limit=100", token=self.token)
        self.assertEqual(status, 200)
        self.assertIn("items", res)
        self.assertIn(self.examiner["id"], [u["id"] for u in res["items"]])

    def test_02_create_user_response(self):
        self.assertEqual(self.examiner["role"], "examiner")
        self.assertTrue(self.examiner["is_active"])
        self.assertEqual(self.examiner["email"], f"examiner.{self.suffix}@dentify.test")
        self.assertNotIn("password", self.examiner)
        self.assertNotIn("password_hash", self.examiner)

    def test_03_duplicate_username_and_email(self):
        base = {"full_name": "Dup", "role": "viewer", "password": PASSWORD}
        status, res = make_request(
            "/api/v1/users",
            method="POST",
            data={**base, "username": self.examiner["username"], "email": f"other.{self.suffix}@dentify.test"},
            token=self.token,
        )
        self.assertEqual(status, 409)
        self.assertIn("Username", res.get("detail", ""))

        status, res = make_request(
            "/api/v1/users",
            method="POST",
            data={**base, "username": f"other_{self.suffix}", "email": self.examiner["email"].upper()},
            token=self.token,
        )
        self.assertEqual(status, 409)
        self.assertIn("Email", res.get("detail", ""))

    def test_04_validation_errors(self):
        base = {"username": f"val_{self.suffix}", "full_name": "Val", "role": "viewer"}
        status, _ = make_request(
            "/api/v1/users", method="POST",
            data={**base, "email": "bukan-email", "password": PASSWORD}, token=self.token,
        )
        self.assertEqual(status, 422)
        status, _ = make_request(
            "/api/v1/users", method="POST",
            data={**base, "email": f"val.{self.suffix}@dentify.test", "password": "pendek"}, token=self.token,
        )
        self.assertEqual(status, 422)

    def test_05_non_admin_forbidden(self):
        status, res = login(self.examiner["username"], PASSWORD)
        self.assertEqual(status, 200)
        examiner_token = res["access_token"]
        status, _ = make_request("/api/v1/users", token=examiner_token)
        self.assertEqual(status, 403)

    def test_06_update_role_and_reset_password(self):
        new_password = "baru-456789"
        status, res = self._put(self.examiner, role="viewer", password=new_password)
        self.assertEqual(status, 200)
        self.assertEqual(res["role"], "viewer")

        self.assertEqual(login(self.examiner["username"], PASSWORD)[0], 401)
        status, res = login(self.examiner["username"], new_password)
        self.assertEqual(status, 200)
        _, me = make_request("/api/v1/auth/me", token=res["access_token"])
        self.assertEqual(me["role"], "viewer")

        # kembalikan untuk test berikutnya
        status, res = self._put(self.examiner, role="examiner", password=PASSWORD)
        self.assertEqual(status, 200)

    def test_07_deactivate_blocks_login_and_existing_token(self):
        _, res = login(self.examiner["username"], PASSWORD)
        old_token = res["access_token"]

        status, res = self._put(self.examiner, is_active=False)
        self.assertEqual(status, 200)
        self.assertFalse(res["is_active"])

        self.assertEqual(login(self.examiner["username"], PASSWORD)[0], 401)
        self.assertEqual(make_request("/api/v1/auth/me", token=old_token)[0], 401)

        status, _ = self._put(self.examiner, is_active=True)
        self.assertEqual(status, 200)

    def test_08_admin_cannot_lock_out_self(self):
        _, me = make_request("/api/v1/auth/me", token=self.token)
        status, res = self._put(me, is_active=False)
        self.assertEqual(status, 400)
        self.assertIn("sendiri", res.get("detail", ""))
        status, _ = self._put(me, role="examiner")
        self.assertEqual(status, 400)

    def test_09_not_found_and_unauthorized(self):
        status, _ = make_request(f"/api/v1/users/{uuid4()}", token=self.token)
        self.assertEqual(status, 404)
        status, _ = make_request("/api/v1/users")
        self.assertEqual(status, 401)


if __name__ == "__main__":
    unittest.main()
