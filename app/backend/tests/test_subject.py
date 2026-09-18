"""
Dentify Tests — Subjects API Tests
"""

import unittest
from tests.test_phase3 import make_request


class TestSubjectAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        status, res = make_request(
            "/api/v1/auth/login",
            method="POST",
            data={"username": "admin", "password": "admin123"},
        )
        assert status == 200, f"Login gagal: {res}"
        cls.token = res["access_token"]

    def test_create_and_query_subject(self):
        payload = {
            "subject_type": "ante_mortem",
            "full_name": "Tes Unit Subject",
            "case_reference": "UNIT-01",
            "notes": "Catatan tes unit",
        }
        status, res = make_request("/api/v1/subjects", method="POST", data=payload, token=self.token)
        self.assertEqual(status, 201)
        sub_id = res["id"]

        status, res = make_request(f"/api/v1/subjects/{sub_id}", method="GET", token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(res["full_name"], "Tes Unit Subject")

        # Clean up via soft-delete
        status, _ = make_request(f"/api/v1/subjects/{sub_id}", method="DELETE", token=self.token)
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
