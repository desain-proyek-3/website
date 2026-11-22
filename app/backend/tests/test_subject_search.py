"""
Dentify Tests — Pencarian Subjek `GET /api/v1/subjects?q=` (search bar header)

Live-server (127.0.0.1:8000, DB/MinIO Docker lokal; mock AI tidak diperlukan):
1. Cocok nama lengkap (mengandung, tidak peka huruf besar/kecil) → AM & PM
2. Cocok referensi kasus
3. Cocok awalan ID subjek (8 karakter seperti yang tampil di UI)
4. Digabung dengan filter subject_type; `total` mengikuti filter
5. Wildcard `%` dan `_` dicocokkan apa adanya (tidak menjadi wildcard SQL)
6. Subjek soft-deleted tidak ikut
7. Kata kunci < 2 karakter (setelah trim) → 422

Jalankan dari app/backend/ (backend aktif):
    python -m unittest tests.test_subject_search -v
"""

import unittest
from urllib.parse import urlencode
from uuid import uuid4

from tests._support import BASE_URL, create_subject, login, make_request, service_up


class TestSubjectSearch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not service_up(BASE_URL):
            raise unittest.SkipTest(f"Backend tidak jalan di {BASE_URL}")
        cls.admin = login("admin", "admin123")
        cls.marker = uuid4().hex[:10]  # unik per run → hasil tidak tercampur data lain
        cls.am = create_subject(cls.admin, "ante_mortem", f"Cari {cls.marker} Budiman", f"AM-REF-{cls.marker}")
        cls.pm = create_subject(cls.admin, "post_mortem", f"Korban {cls.marker} Tanpa KTP", f"KASUS-{cls.marker}-01")
        cls.deleted = create_subject(cls.admin, "post_mortem", f"Terhapus {cls.marker}", None)
        status, res = make_request(f"/api/v1/subjects/{cls.deleted}", method="DELETE", token=cls.admin)
        assert status in (200, 204), f"Soft-delete gagal: {res}"

    @classmethod
    def tearDownClass(cls):
        for sid in (cls.am, cls.pm):
            make_request(f"/api/v1/subjects/{sid}", method="DELETE", token=cls.admin)

    def search(self, q, expect=200, **params):
        status, res = make_request(f"/api/v1/subjects?{urlencode({'q': q, 'limit': 100, **params})}", token=self.admin)
        self.assertEqual(status, expect, res)
        return res

    def ids(self, res):
        return {s["id"] for s in res["items"]}

    def test_01_name_contains_case_insensitive(self):
        for q in (self.marker, self.marker.upper(), f"cari {self.marker[:6]}"):
            res = self.search(q)
            self.assertIn(self.am, self.ids(res), q)
        res = self.search(self.marker)
        self.assertEqual(self.ids(res), {self.am, self.pm})
        self.assertEqual(res["total"], 2)

    def test_02_case_reference(self):
        res = self.search(f"kasus-{self.marker}")
        self.assertEqual(self.ids(res), {self.pm})

    def test_03_id_prefix(self):
        res = self.search(self.pm[:8])
        self.assertIn(self.pm, self.ids(res))
        res = self.search(self.pm[:8].upper())  # ID UUID disimpan huruf kecil; input huruf besar tetap cocok
        self.assertIn(self.pm, self.ids(res))

    def test_04_combined_with_subject_type(self):
        res = self.search(self.marker, subject_type="ante_mortem")
        self.assertEqual(self.ids(res), {self.am})
        self.assertEqual(res["total"], 1)
        self.assertTrue(all(s["subject_type"] == "ante_mortem" for s in res["items"]))

    def test_05_wildcards_are_literal(self):
        # tanpa escape, '_' dan '%' akan cocok dengan karakter apa pun di marker
        self.assertEqual(self.search(f"{self.marker[:4]}_{self.marker[5:]}")["items"], [])
        self.assertEqual(self.search(f"{self.marker[:3]}%{self.marker[6:]}")["items"], [])

    def test_06_soft_deleted_excluded(self):
        res = self.search(f"terhapus {self.marker}")
        self.assertEqual(res["items"], [])
        self.assertNotIn(self.deleted, self.ids(self.search(self.deleted[:8])))

    def test_07_too_short(self):
        self.search("a", expect=422)
        self.search("  b  ", expect=422)


if __name__ == "__main__":
    unittest.main()
