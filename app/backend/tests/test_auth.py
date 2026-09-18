"""
Dentify Tests — Auth API Tests
"""

import unittest
from tests.test_phase3 import make_request


class TestAuthAPI(unittest.TestCase):
    def test_login_success(self):
        status, res = make_request(
            "/api/v1/auth/login",
            method="POST",
            data={"username": "admin", "password": "admin123"},
        )
        self.assertEqual(status, 200)
        self.assertIn("access_token", res)
        self.assertEqual(res.get("token_type"), "bearer")

    def test_login_invalid_credentials(self):
        status, res = make_request(
            "/api/v1/auth/login",
            method="POST",
            data={"username": "admin", "password": "wrongpassword"},
        )
        self.assertEqual(status, 401)

    def test_get_me(self):
        status, res = make_request(
            "/api/v1/auth/login",
            method="POST",
            data={"username": "admin", "password": "admin123"},
        )
        token = res["access_token"]
        status, me = make_request("/api/v1/auth/me", method="GET", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(me["username"], "admin")
        self.assertEqual(me["role"], "admin")


if __name__ == "__main__":
    unittest.main()
