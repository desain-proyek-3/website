"""
Dentify Tests — Device Captures (Inbox foto dari alat ESP32)
Test live-server (default 127.0.0.1:8000, override DENTIFY_TEST_BASE_URL) dengan DB/MinIO Docker lokal.

1. Ingest alat: tanpa key / key salah → 401, hash salah → 422, bukan JPEG → 400,
   device_id tidak cocok → 400, valid → 201 (pending)
2. List & file: examiner bisa, viewer 403; isi file identik + header hash
3. Assign: PM oleh examiner → dental_image dengan hash/device/captured_at dari alat;
   assign ulang → 409; sudut terisi → 409 (capture tetap pending); AM oleh examiner → 403, oleh admin → OK
4. assignable-subjects: examiner tidak melihat AM; subjek 3 sudut tidak muncul
5. Discard: soft delete → 'discarded'; discard/assign ulang → 409

Data test dibersihkan di tearDownClass (subjek di-soft-delete, user dinonaktifkan,
capture & alat test dihapus dari DB).
"""

import hashlib
import json
import unittest
import urllib.error
import urllib.request
from uuid import UUID, uuid4

from sqlalchemy import delete

from _support import (
    BASE_URL,
    build_multipart,
    create_subject,
    create_user,
    deactivate_user,
    login,
    make_request,
    run_db,
    upload_image,
)
from models.device import Device, DeviceCapture
from services.device_service import hash_device_key

JPEG = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xFF\xDB\x00C\x00" + b"\x10" * 64 + b"\xFF\xD9"
CAPTURED_AT = "2026-11-24T10:15:00+07:00"


def ingest(key: str | None, data: bytes = JPEG, sha: str | None = None, **fields) -> tuple[int, dict]:
    form = {"sha256": sha if sha is not None else hashlib.sha256(data).hexdigest(), **fields}
    body, ctype = build_multipart(form, {"file": ("photo_001.jpg", data, "image/jpeg")})
    headers = {"Content-Type": ctype}
    if key:
        headers["X-Device-Key"] = key
    req = urllib.request.Request(f"{BASE_URL}/api/v1/device/captures", data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


def get_raw(path: str, token: str):
    req = urllib.request.Request(f"{BASE_URL}{path}", headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read(), resp.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers


class TestDeviceCaptures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = login("admin", "admin123")
        cls.examiner_user, cls.examiner = create_user(cls.admin, "examiner", "devcap")
        cls.viewer_user, cls.viewer = create_user(cls.admin, "viewer", "devcap")

        cls.device_code = f"test-cam-{uuid4().hex[:6]}"
        cls.device_key = f"test-key-{uuid4().hex}"

        async def add_device(session):
            device = Device(device_code=cls.device_code, name="Test cam", api_key_hash=hash_device_key(cls.device_key))
            session.add(device)
            await session.flush()
            return device.id

        cls.device_id = run_db(add_device)
        cls.subjects: list[str] = []

    @classmethod
    def tearDownClass(cls):
        for sid in cls.subjects:
            make_request(f"/api/v1/subjects/{sid}", method="DELETE", token=cls.admin)
        deactivate_user(cls.admin, cls.examiner_user)
        deactivate_user(cls.admin, cls.viewer_user)

        async def cleanup(session):
            await session.execute(delete(DeviceCapture).where(DeviceCapture.device_id == cls.device_id))
            await session.execute(delete(Device).where(Device.id == cls.device_id))

        run_db(cleanup)

    def new_subject(self, subject_type: str = "post_mortem", token: str | None = None) -> str:
        sid = create_subject(token or self.admin, subject_type, f"DevCap {subject_type} {uuid4().hex[:4]}")
        self.subjects.append(sid)
        return sid

    def new_capture(self) -> dict:
        data = JPEG + uuid4().bytes  # isi unik per capture
        status, res = ingest(self.device_key, data, device_id=self.device_code, captured_at=CAPTURED_AT)
        self.assertEqual(status, 201, res)
        res["_bytes"] = data
        return res

    def assign(self, capture_id: str, subject_id: str, view: str, token: str) -> tuple[int, dict]:
        return make_request(
            f"/api/v1/device-captures/{capture_id}/assign",
            method="POST",
            data={"subject_id": subject_id, "view_type": view},
            token=token,
        )

    def pending_ids(self, token: str) -> set[str]:
        status, res = make_request("/api/v1/device-captures?status=pending&limit=100", token=token)
        self.assertEqual(status, 200, res)
        return {i["id"] for i in res["items"]}

    # ── 1. Ingest ────────────────────────────────────────────────────────

    def test_ingest_rejects_bad_requests(self):
        self.assertEqual(ingest(None)[0], 401)
        self.assertEqual(ingest("salah")[0], 401)
        status, res = ingest(self.device_key, sha="0" * 64)
        self.assertEqual(status, 422, res)
        self.assertIn("SHA-256 tidak cocok", res["detail"])
        self.assertEqual(ingest(self.device_key, data=b"bukan jpeg sama sekali")[0], 400)
        self.assertEqual(ingest(self.device_key, device_id="alat-lain")[0], 400)

    def test_ingest_ok_appears_in_inbox(self):
        cap = self.new_capture()
        self.assertEqual(cap["status"], "pending")
        self.assertEqual(cap["device_id"], self.device_code)
        self.assertEqual(cap["sha256"], hashlib.sha256(cap["_bytes"]).hexdigest())

        status, res = make_request("/api/v1/device-captures?limit=100", token=self.examiner)
        self.assertEqual(status, 200, res)
        item = next(i for i in res["items"] if i["id"] == cap["capture_id"])
        self.assertEqual(item["device_code"], self.device_code)
        self.assertEqual(item["file_size"], len(cap["_bytes"]))
        self.assertTrue(item["image_url"])

        self.assertEqual(make_request("/api/v1/device-captures", token=self.viewer)[0], 403)

    def test_download_file(self):
        cap = self.new_capture()
        status, body, headers = get_raw(f"/api/v1/device-captures/{cap['capture_id']}/file", self.examiner)
        self.assertEqual(status, 200)
        self.assertEqual(body, cap["_bytes"])
        self.assertEqual(headers.get("X-Content-SHA256"), cap["sha256"])
        self.assertEqual(get_raw(f"/api/v1/device-captures/{cap['capture_id']}/file", self.viewer)[0], 403)
        self.assertEqual(get_raw(f"/api/v1/device-captures/{uuid4()}/file", self.examiner)[0], 404)

    # ── 3. Assign ────────────────────────────────────────────────────────

    def test_assign_pm_by_examiner(self):
        cap = self.new_capture()
        sid = self.new_subject("post_mortem", token=self.examiner)

        status, img = self.assign(cap["capture_id"], sid, "kiri", self.examiner)
        self.assertEqual(status, 200, img)
        self.assertEqual(img["subject_id"], sid)
        self.assertEqual(img["view_type"], "kiri")
        self.assertEqual(img["file_hash"], cap["sha256"])
        self.assertEqual(img["device_id"], self.device_code)
        self.assertIsNotNone(img["captured_at"])
        self.assertTrue(img["image_url"])

        self.assertNotIn(cap["capture_id"], self.pending_ids(self.examiner))
        status, res = make_request("/api/v1/device-captures?status=assigned&limit=100", token=self.examiner)
        assigned = next(i for i in res["items"] if i["id"] == cap["capture_id"])
        self.assertEqual(assigned["dental_image_id"], img["id"])

        # Citra baru terlihat di daftar citra subjek
        status, imgs = make_request(f"/api/v1/subjects/{sid}/images", token=self.examiner)
        self.assertEqual(status, 200, imgs)
        self.assertIn("kiri", [i["view_type"] for i in imgs["items"]])

        # Assign ulang foto yang sama → 409
        other = self.new_subject("post_mortem", token=self.examiner)
        self.assertEqual(self.assign(cap["capture_id"], other, "depan", self.examiner)[0], 409)

    def test_assign_view_taken_keeps_capture_pending(self):
        sid = self.new_subject("post_mortem")
        upload_image(self.admin, sid, "depan")
        cap = self.new_capture()
        status, res = self.assign(cap["capture_id"], sid, "depan", self.examiner)
        self.assertEqual(status, 409, res)
        self.assertIn(cap["capture_id"], self.pending_ids(self.examiner))

    def test_assign_am_admin_only(self):
        cap = self.new_capture()
        am = self.new_subject("ante_mortem")
        self.assertEqual(self.assign(cap["capture_id"], am, "depan", self.examiner)[0], 403)
        self.assertIn(cap["capture_id"], self.pending_ids(self.examiner))
        status, img = self.assign(cap["capture_id"], am, "depan", self.admin)
        self.assertEqual(status, 200, img)

    def test_assign_unknown_subject_or_capture(self):
        cap = self.new_capture()
        self.assertEqual(self.assign(cap["capture_id"], str(uuid4()), "depan", self.examiner)[0], 404)
        sid = self.new_subject("post_mortem")
        self.assertEqual(self.assign(str(uuid4()), sid, "depan", self.examiner)[0], 404)
        self.assertEqual(self.assign(cap["capture_id"], sid, "depan", self.viewer)[0], 403)

    # ── 4. assignable-subjects ───────────────────────────────────────────

    def test_assignable_subjects(self):
        tag = uuid4().hex[:6]
        pm = create_subject(self.admin, "post_mortem", f"Assignable PM {tag}")
        am = create_subject(self.admin, "ante_mortem", f"Assignable AM {tag}")
        full = create_subject(self.admin, "post_mortem", f"Assignable FULL {tag}")
        self.subjects += [pm, am, full]
        upload_image(self.admin, pm, "kanan")
        for v in ("depan", "kiri", "kanan"):
            upload_image(self.admin, full, v)

        status, res = make_request(f"/api/v1/device-captures/assignable-subjects?q={tag}", token=self.admin)
        self.assertEqual(status, 200, res)
        by_id = {i["id"]: i for i in res["items"]}
        self.assertIn(pm, by_id)
        self.assertIn(am, by_id)
        self.assertNotIn(full, by_id)
        self.assertEqual(by_id[pm]["filled_views"], ["kanan"])

        status, res = make_request(f"/api/v1/device-captures/assignable-subjects?q={tag}", token=self.examiner)
        self.assertEqual(status, 200, res)
        ids = {i["id"] for i in res["items"]}
        self.assertIn(pm, ids)
        self.assertNotIn(am, ids)

    # ── 5. Discard ───────────────────────────────────────────────────────

    def test_discard(self):
        cap = self.new_capture()
        self.assertEqual(
            make_request(f"/api/v1/device-captures/{cap['capture_id']}", method="DELETE", token=self.viewer)[0], 403
        )
        status, res = make_request(f"/api/v1/device-captures/{cap['capture_id']}", method="DELETE", token=self.examiner)
        self.assertEqual(status, 200, res)
        self.assertEqual(res["status"], "discarded")
        self.assertIsNotNone(res["deleted_at"])
        self.assertNotIn(cap["capture_id"], self.pending_ids(self.examiner))

        self.assertEqual(
            make_request(f"/api/v1/device-captures/{cap['capture_id']}", method="DELETE", token=self.examiner)[0], 409
        )
        sid = self.new_subject("post_mortem")
        self.assertEqual(self.assign(cap["capture_id"], sid, "depan", self.examiner)[0], 409)

        # Soft delete: baris tetap ada
        async def fetch(session):
            return await session.get(DeviceCapture, UUID(cap["capture_id"]))

        row = run_db(fetch)
        self.assertEqual(row.status, "discarded")


if __name__ == "__main__":
    unittest.main(verbosity=2)
