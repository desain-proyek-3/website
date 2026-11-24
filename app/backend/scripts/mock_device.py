"""
Dentify — Simulator alat ESP32 (development).

Mengirim JPEG ke POST /api/v1/device/captures persis seperti firmware
(esp/CameraWebServer.ino): header X-Device-Key, multipart file + device_id + sha256
+ captured_at (+ view_type opsional). Berguna untuk menguji Inbox tanpa alat fisik.

Jalankan dari app/backend/:
    venv\\Scripts\\python scripts\\mock_device.py --key <DEVICE_KEY> ..\\..\\img\\alicia-depan.jpeg
    venv\\Scripts\\python scripts\\mock_device.py --key <KEY> --view kiri --url http://127.0.0.1:8000 foto1.jpg foto2.jpg
Key dibuat dengan: venv\\Scripts\\python scripts\\create_device.py --code dentify-cam-01 --name "Alat 1"
JANGAN di-deploy — hanya untuk development.
"""

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path


def send(url: str, key: str, device_id: str, path: Path, view: str | None) -> int:
    data = path.read_bytes()
    fields = {
        "device_id": device_id,
        "sha256": hashlib.sha256(data).hexdigest(),
        "captured_at": datetime.now(timezone(timedelta(hours=7))).isoformat(timespec="seconds"),
    }
    if view:
        fields["view_type"] = view

    boundary = f"----dentify{uuid.uuid4().hex[:12]}"
    body = bytearray()
    for name, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    body += (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode()
    body += data + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"{url.rstrip('/')}/api/v1/device/captures",
        data=bytes(body),
        method="POST",
        headers={"X-Device-Key": key, "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            print(f"[{resp.status}] {path.name}: {json.loads(resp.read())}")
            return resp.status
    except urllib.error.HTTPError as e:
        print(f"[{e.code}] {path.name}: {e.read().decode(errors='replace')}")
        return e.code


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulasi alat ESP32 mengirim foto ke Inbox Dentify")
    parser.add_argument("files", nargs="+", type=Path, help="File JPEG yang dikirim")
    parser.add_argument("--key", required=True, help="DEVICE_KEY dari create_device.py")
    parser.add_argument("--device-id", default="dentify-cam-01", help="device_code alat (default dentify-cam-01)")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="Base URL backend")
    parser.add_argument("--view", choices=["depan", "kiri", "kanan"], help="Petunjuk sudut (opsional)")
    args = parser.parse_args()
    codes = [send(args.url, args.key, args.device_id, f, args.view) for f in args.files]
    sys.exit(0 if all(c == 201 for c in codes) else 1)
