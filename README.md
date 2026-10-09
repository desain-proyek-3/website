# Dentify — Sistem Disaster Victim Identification (DVI) Forensik Gigi Berbasis AI

Dentify adalah sistem identifikasi korban bencana (*Disaster Victim Identification* / DVI) berbasis odontologi forensik yang mengintegrasikan perangkat akuisisi citra intraoral portabel (*smart dental scanner*), pipeline *artificial intelligence* (AI/ML) untuk analisis biometrik gigi, dan web platform terpusat untuk verifikasi serta pelaporan otomatis berstandar INTERPOL.

Repositori ini merupakan monorepo yang mencakup komponen **Backend** dan **Frontend** untuk aplikasi web Dentify.

---

## Backend

### 1. Deskripsi Singkat
Modul backend pada sistem Dentify bertindak sebagai fondasi data dan integrasi terpusat. Backend bertanggung jawab untuk mengelola siklus hidup data forensik *ante-mortem* (AM) dan *post-mortem* (PM), penyimpanan aman citra intraoral beresolusi tinggi, orkestrasi inferensi AI, serta penegakan integritas data barang bukti melalui *tamper-evident audit logging*.

Dalam konteks forensik dan DVI, keabsahan data (*chain-of-custody*) adalah prioritas mutlak. Backend Dentify menerapkan mekanisme pencatatan audit berbasis *hash-chain* (SHA-256), *soft-delete* permanen untuk menjaga jejak rekam medis forensik, kontrol akses berbasis peran (RBAC), serta enkripsi data untuk menjamin kerahasiaan data biometrik korban sesuai regulasi privasi medis.

---

### 2. Tech Stack

- **Web Framework:** FastAPI (Python 3.10+) — REST API asinkron berkinerja tinggi dengan validasi skema otomatis melalui Pydantic v2.
- **Database & ORM:** PostgreSQL 17 dengan ekstensi `pgvector` (vektor embedding biometrik 512 dimensi) menggunakan SQLAlchemy 2.0 (asyncio) dan driver `asyncpg`.
- **Vector Database:** ChromaDB — penyimpanan embedding teks dan pencarian semantik untuk literatur forensik serta panduan INTERPOL DVI.
- **Object Storage:** MinIO (S3-compatible) — penyimpanan citra klinis intraoral dengan akses berbasis *presigned URL* aman dan verifikasi checksum SHA-256.
- **Autentikasi & Keamanan:** JSON Web Token (JWT via `python-jose`) dengan algoritma HS256, enkripsi kata sandi menggunakan `passlib[bcrypt]`, serta Role-Based Access Control (RBAC).
- **Audit Logging:** Structured JSON logging (`python-json-logger`) yang diperkuat mekanisme kriptografis *hash-chaining* (SHA-256) dengan proteksi konkurensi PostgreSQL advisory lock.
- **Integrasi AI:** HTTP client asinkron `httpx` untuk berkomunikasi dengan AI microservice terpisah (pola *trigger* + *polling*).
- **ASGI Server:** Uvicorn.
- **Containerization:** Docker & Docker Compose untuk orkestrasi *service* pendukung (PostgreSQL, ChromaDB, MinIO).

---

### 3. Struktur Folder Backend

Seluruh kode sumber backend berada di dalam direktori `app/backend/`. Berkas skema SQL berada di root repositori.

```
website/
├── docker-compose.yml          # Orkestrasi PostgreSQL + ChromaDB + MinIO
├── schema_phase1.sql           # 6 tabel inti DVI + ekstensi vector (dijalankan otomatis oleh Docker)
├── schema_phase2_audit.sql     # Tabel audit_logs (hash-chain)
├── schema_phase3a.sql          # Kolom soft-delete subjects & dental_images
├── schema_phase3b_inference.sql# Tabel inference_jobs
└── app/backend/
    ├── alembic/                # Konfigurasi migrasi Alembic (persiapan, belum diaktifkan)
    ├── alembic.ini
    ├── api/v1/                 # Router dan endpoint REST API
    │   ├── router.py           # Penggabung seluruh sub-router API v1
    │   ├── auth.py             # Login & profil user
    │   ├── users.py            # Manajemen akun pengguna (admin-only)
    │   ├── subjects.py         # CRUD data subjek AM & PM
    │   ├── dental_images.py    # Upload & manajemen citra intraoral, hasil deteksi per gigi
    │   ├── inference.py        # Trigger inferensi AI & status job (background polling)
    │   ├── audit.py            # Audit log & verifikasi integritas chain
    │   └── matching_results.py # (placeholder — belum diimplementasikan)
    ├── core/
    │   ├── config.py           # Pydantic Settings (pembacaan .env)
    │   ├── database.py         # Async engine SQLAlchemy, session factory, health check DB
    │   └── security.py         # Hashing password (bcrypt) & encode/decode JWT
    ├── dependencies/
    │   └── auth.py             # get_current_user, require_role, ensure_can_modify_subject_type
    ├── middleware/
    │   └── audit_middleware.py # AuditLogMiddleware (pencatatan otomatis request tanpa latensi)
    ├── models/                 # SQLAlchemy ORM
    │   ├── user.py, subject.py, dental_image.py, tooth_record.py
    │   ├── embedding.py        # Vektor pgvector 512-dimensi
    │   ├── matching_result.py  # Skor kecocokan AM-PM
    │   ├── inference_job.py    # Pelacakan job inferensi AI
    │   └── audit_log.py        # Audit log hash-chain
    ├── schemas/                # Validasi & serialisasi Pydantic
    │   ├── user.py, subject.py, dental_image.py, tooth_record.py
    │   ├── inference_job.py, audit.py
    │   └── matching_result.py  # (placeholder — belum diimplementasikan)
    ├── services/
    │   ├── auth_service.py     # Autentikasi kredensial pengguna
    │   ├── audit_service.py    # Pembuatan hash-chain audit & verifikasi integritas
    │   ├── storage_service.py  # Wrapper MinIO (upload, SHA-256, presigned URL)
    │   └── ai_service_client.py# HTTP client AI microservice (seluruh asumsi kontrak AI diisolasi di sini)
    ├── scripts/
    │   └── seed_admin.py       # Pembuatan akun administrator awal
    ├── tests/                  # Test suite (lihat §11)
    ├── main.py                 # Entry point FastAPI (lifespan, middleware, CORS)
    ├── requirements.txt
    ├── .env.example            # Template variabel lingkungan
    └── .env                    # Variabel lingkungan lokal (diabaikan git)
```

---

### 4. Prasyarat (Prerequisites)

Sebelum menjalankan backend Dentify, pastikan perangkat telah terpasang:

1. **Docker Desktop & Docker Compose:**
   - Docker Engine v24.0+ / Docker Compose v2.20+
2. **Python:**
   - Python versi 3.10 atau lebih baru (direkomendasikan Python 3.11 / 3.12)
3. **Git & PostgreSQL Client Tools (Opsional):**
   - `psql` (opsional, jika ingin mengeksekusi file SQL langsung dari host tanpa Docker exec)

> **Catatan untuk Pengguna Windows:** Jika memiliki instalasi PostgreSQL native di Windows, pastikan layanan `postgresql-x64-<versi>` dihentikan via `services.msc` agar tidak terjadi bentrok alokasi port `5432` dengan container Docker. Layanan ini umumnya *auto-start*, jadi periksa kembali setiap kali laptop di-restart.

---

### 5. Cara Setup & Menjalankan (Getting Started)

Ikuti langkah-langkah berikut secara berurutan:

#### 5.1 Clone Repository
```bash
git clone <URL_REPOSITORY_DENTIFY>
cd website
```

#### 5.2 Konfigurasi Environment Variables (`.env`)
Sistem menggunakan **dua file `.env` berbeda** untuk memisahkan konfigurasi container dan runtime backend. Keduanya diabaikan oleh git.

1. **`.env` pada Root (`website/.env`):**
   Digunakan secara khusus oleh Docker Compose untuk menginisialisasi container PostgreSQL, ChromaDB, dan MinIO. Buat file `.env` di root direktori:
   ```env
   # PostgreSQL
   POSTGRES_USER=dentify_admin
   POSTGRES_PASSWORD=<your_postgres_password>
   POSTGRES_DB=dentify_db
   POSTGRES_PORT=5432

   # ChromaDB (remap ke port 8001 di host)
   CHROMA_PORT=8001

   # MinIO
   MINIO_ROOT_USER=minioadmin
   MINIO_ROOT_PASSWORD=<your_minio_password>
   MINIO_API_PORT=9000
   MINIO_CONSOLE_PORT=9001
   ```

2. **`.env` pada Backend (`website/app/backend/.env`):**
   Digunakan oleh FastAPI via Pydantic Settings (`core/config.py`). Salin dari template yang disediakan:
   ```bash
   cp app/backend/.env.example app/backend/.env
   ```
   Buka `app/backend/.env` dan lengkapi nilainya (kredensial PostgreSQL & MinIO harus **sama** dengan `.env` root):
   ```env
   POSTGRES_USER=dentify_admin
   POSTGRES_PASSWORD=<your_postgres_password>
   POSTGRES_DB=dentify_db
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432

   CHROMA_HOST=localhost
   CHROMA_PORT=8001

   MINIO_ROOT_USER=minioadmin
   MINIO_ROOT_PASSWORD=<your_minio_password>
   MINIO_HOST=localhost
   MINIO_API_PORT=9000
   MINIO_CONSOLE_PORT=9001
   MINIO_BUCKET_NAME=dentify-intraoral-images

   # AI microservice (lihat §9)
   AI_SERVICE_BASE_URL=http://localhost:8100
   AI_SERVICE_API_KEY=<shared_api_key_dengan_tim_ai>
   AI_SERVICE_TIMEOUT_SECONDS=30.0
   AI_SERVICE_POLL_INTERVAL_SECONDS=2.0
   AI_SERVICE_MAX_POLL_ATTEMPTS=60

   JWT_SECRET_KEY=<generate_random_secret_min_32_chars>
   JWT_ALGORITHM=HS256
   JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

   SEED_ADMIN_PASSWORD=<your_initial_admin_password>

   APP_NAME=Dentify API
   APP_VERSION=0.1.0
   DEBUG=True

   # Origin frontend yang diizinkan (JSON list)
   CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
   ```

#### 5.3 Menjalankan Docker Compose
Jalankan container database dan object storage dari root direktori:
```bash
docker compose up -d
```
Pastikan seluruh service berjalan dengan memeriksa statusnya:
```bash
docker compose ps
```

#### 5.4 Eksekusi Skema Database
`schema_phase1.sql` **dijalankan otomatis** oleh container PostgreSQL saat volume `dentify_pg_data` pertama kali dibuat (di-mount ke `/docker-entrypoint-initdb.d/`). Jangan menjalankannya ulang secara manual — berkas ini tidak idempoten dan akan gagal karena tipe/tabel sudah ada.

Skema lanjutan dijalankan manual, **berurutan**, dari root direktori:

- **Linux / macOS (Bash):**
  ```bash
  docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db < schema_phase2_audit.sql
  docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db < schema_phase3a.sql
  docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db < schema_phase3b_inference.sql
  ```

- **Windows (PowerShell):**
  ```powershell
  Get-Content schema_phase2_audit.sql | docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db
  Get-Content schema_phase3a.sql | docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db
  Get-Content schema_phase3b_inference.sql | docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db
  ```

> *Urutan skema:*
> 1. `schema_phase1.sql` (otomatis): 6 tabel inti DVI (`users`, `subjects`, `dental_images`, `tooth_records`, `embeddings`, `matching_results`) + ekstensi `vector` (pgvector).
> 2. `schema_phase2_audit.sql`: Tabel `audit_logs` untuk pencatatan *tamper-evident*.
> 3. `schema_phase3a.sql`: Kolom *soft-delete* (`is_deleted`, `deleted_at`, `deleted_by`) pada tabel `subjects` dan `dental_images`.
> 4. `schema_phase3b_inference.sql`: Tipe `inference_job_status_enum` dan tabel `inference_jobs`.
>
> Migrasi skema masih manual via berkas `.sql`; Alembic sudah tersedia di repo namun belum diaktifkan.

#### 5.5 Instalasi Dependensi Python
Masuk ke direktori backend, buat dan aktifkan virtual environment:

- **Windows (PowerShell):**
  ```powershell
  cd app/backend
  python -m venv venv
  .\venv\Scripts\Activate.ps1
  pip install -r requirements.txt
  ```

- **Linux / macOS:**
  ```bash
  cd app/backend
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
  ```

#### 5.6 Seed Pengguna Administrator Awal
Jalankan script seed dari direktori `app/backend/` untuk membuat akun administrator pertama:
```bash
python scripts/seed_admin.py
```
*Script ini membuat akun dengan username `admin` dan password dari variabel `SEED_ADMIN_PASSWORD` pada `app/backend/.env`. Akun pengguna lainnya dibuat oleh admin melalui endpoint `/api/v1/users` (tidak ada pendaftaran mandiri).*

#### 5.7 Menjalankan Server FastAPI
Jalankan server pengembangan FastAPI dari direktori `app/backend/`:
```bash
cd app/backend
uvicorn main:app --reload
```

> ⚠️ **PERINGATAN PENTING:** Jalankan perintah `uvicorn main:app --reload` tepat dari dalam direktori `app/backend/`. **JANGAN** menjalankan `uvicorn app.main:app` dari root, karena akan menyebabkan `ModuleNotFoundError` pada modul internal.

Saat startup, backend otomatis membuat bucket MinIO `dentify-intraoral-images` bila belum ada.

#### 5.8 Akses Dokumentasi Interaktif (Swagger UI)
Setelah server aktif, buka peramban dan akses:
- **Swagger UI:** `http://127.0.0.1:8000/docs`
- **ReDoc:** `http://127.0.0.1:8000/redoc`
- **Health Check:** `http://127.0.0.1:8000/health`

---

### 6. Port yang Digunakan

| Service | Host Port | Internal Port | Deskripsi |
|---|---|---|---|
| **FastAPI (Uvicorn)** | `8000` | `8000` | REST API backend utama dan endpoint Swagger UI |
| **PostgreSQL** | `5432` | `5432` | Database relasional forensik + ekstensi `pgvector` |
| **ChromaDB** | **`8001`** ⚠️ | `8000` | Vector database untuk literatur DVI & RAG retrieval |
| **MinIO API** | `9000` | `9000` | S3-compatible API untuk upload dan retrieval citra |
| **MinIO Console** | `9001` | `9001` | Web GUI manajemen bucket dan object storage |
| **AI Microservice** | `8100` | — | Service AI milik tim Komputer-AI (dijalankan terpisah, di luar Docker Compose ini) |
| **Frontend (Vite)** | `5173` | — | Dev server React (lihat bagian Frontend) |

> ⚠️ **Catatan Khusus Port ChromaDB:** Port host ChromaDB dialihkan ke **`8001`** (bukan default `8000`) untuk mencegah bentrok dengan server FastAPI yang berjalan di port `8000`. Container ChromaDB tetap mendengarkan port internal `8000` (`8001:8000`) — jangan ubah port container di `docker-compose.yml`.

> ⚠️ **Aturan MinIO:** Semua operasi berkas (upload/hapus) **wajib** melalui endpoint API. Jangan memanipulasi objek langsung lewat MinIO Console, karena metadata di database dan berkas di storage akan tidak sinkron.

---

### 7. Autentikasi & Kontrol Akses (RBAC)

Backend mengadopsi skema otentikasi stateless menggunakan **JWT (JSON Web Token)** dengan 3 role pengguna (*Role-Based Access Control*):

1. **`admin`**: Hak akses menyeluruh, termasuk manajemen pengguna, verifikasi integritas audit trail, dan **satu-satunya role yang dapat membuat/mengubah/menghapus data ante-mortem (AM)** beserta citra dan inferensinya.
2. **`examiner`**: Odontolog forensik atau petugas lapangan yang dapat membuat/memperbarui data subjek **post-mortem (PM)**, mengunggah citra klinis, dan menjalankan inferensi AI untuk data PM.
3. **`viewer`**: Personel peninjau dengan izin baca-saja (*read-only*) untuk seluruh data subjek (AM & PM), citra, hasil deteksi gigi, dan status job.

**Tidak ada pendaftaran mandiri (*self-signup*).** Akun dibuat oleh admin via `/api/v1/users`. Akun tidak pernah dihapus, hanya dinonaktifkan (`is_active=false`), karena dirujuk oleh data forensik dan audit log. Penonaktifan dan perubahan role berlaku seketika, termasuk untuk token yang sudah diterbitkan.

#### Alur Penggunaan Token:
1. **Otentikasi Login:** Kirim `POST /api/v1/auth/login` dengan body **JSON**:
   ```http
   POST /api/v1/auth/login
   Content-Type: application/json

   { "username": "admin", "password": "<password>" }
   ```
2. **Menerima Token:** Respons berupa:
   ```json
   {
     "access_token": "<jwt_access_token_string>",
     "token_type": "bearer"
   }
   ```
   Token berlaku sesuai `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` (default 30 menit). Belum ada mekanisme *refresh token*.
3. **Otorisasi Request Lanjutan:** Sertakan token pada header HTTP setiap pemanggilan endpoint terproteksi:
   ```http
   Authorization: Bearer <jwt_access_token_string>
   ```
4. **Kode error:** `401` bila token tidak ada/tidak valid/kedaluwarsa, `403` bila role tidak memiliki izin. Seluruh error dikembalikan dalam format standar FastAPI `{ "detail": "..." }`.

#### CORS
`CORSMiddleware` aktif untuk origin pada setting `CORS_ORIGINS` (default dev server Vite `http://localhost:5173` dan `http://127.0.0.1:5173`). Token dikirim lewat header `Authorization`, bukan cookie, sehingga `allow_credentials=False`.

---

### 8. Daftar Endpoint API (Ringkas)

| Modul | Method | Endpoint | Role | Fungsi Singkat |
|---|---|---|---|---|
| **System** | `GET` | `/health` | Publik | Health-check status koneksi database PostgreSQL |
| **System** | `GET` | `/` | Publik | Welcome message dan tautan dokumentasi |
| **Auth** | `POST` | `/api/v1/auth/login` | Publik | Login username & password (JSON), mengembalikan access token |
| **Auth** | `GET` | `/api/v1/auth/me` | Semua role | Profil user yang sedang login |
| **Users** | `GET` | `/api/v1/users` | `admin` | Daftar akun (paginasi, filter `role` & `is_active`) |
| **Users** | `GET` | `/api/v1/users/{id}` | `admin` | Detail akun |
| **Users** | `POST` | `/api/v1/users` | `admin` | Buat akun baru (409 bila username/email sudah dipakai) |
| **Users** | `PUT` | `/api/v1/users/{id}` | `admin` | Ubah email, nama, role, status aktif; `password` opsional untuk reset |
| **Subjects** | `POST` | `/api/v1/subjects` | `admin`, `examiner`¹ | Pendaftaran subjek baru (`ante_mortem` / `post_mortem`) |
| **Subjects** | `GET` | `/api/v1/subjects` | Semua role | Daftar subjek aktif (paginasi & filter `subject_type`) |
| **Subjects** | `GET` | `/api/v1/subjects/{id}` | Semua role | Detail satu subjek |
| **Subjects** | `PUT` | `/api/v1/subjects/{id}` | `admin`, `examiner`¹ | Pembaruan data subjek secara utuh (*full update*) |
| **Subjects** | `DELETE` | `/api/v1/subjects/{id}` | `admin`, `examiner`¹ | *Soft-delete* subjek **beserta seluruh citra aktifnya** (satu transaksi) |
| **Dental Images** | `POST` | `/api/v1/dental-images/upload` | `admin`, `examiner`¹ | Upload citra (multipart: `file`, `subject_id`, `view_type` depan/kiri/kanan) ke MinIO & DB |
| **Dental Images** | `GET` | `/api/v1/dental-images/{id}` | Semua role | Metadata citra beserta *presigned URL* aktif |
| **Dental Images** | `DELETE` | `/api/v1/dental-images/{id}` | `admin`, `examiner`¹ | *Soft-delete* citra (berkas fisik di MinIO tetap dipertahankan) |
| **Dental Images** | `GET` | `/api/v1/subjects/{id}/images` | Semua role | Daftar citra aktif milik suatu subjek |
| **Dental Images** | `GET` | `/api/v1/dental-images/{id}/tooth-records` | Semua role | Hasil deteksi per gigi (FDI, bbox, landmarks, morfologi, confidence), urut FDI |
| **Inference** | `POST` | `/api/v1/inference/trigger` | `admin`, `examiner`¹ | Membuat job inferensi AI untuk satu citra (202 Accepted, diproses di background) |
| **Inference** | `GET` | `/api/v1/inference/jobs/{job_id}` | Semua role | Status & hasil job (`pending` / `processing` / `completed` / `failed`) |
| **Audit** | `GET` | `/api/v1/audit/logs` | `admin`, `examiner` | Riwayat jejak audit sistem |
| **Audit** | `GET` | `/api/v1/audit/verify` | `admin` | Verifikasi integritas kriptografis *hash-chain* log |

¹ Untuk data **ante-mortem** (termasuk citra dan inferensi milik subjek AM, serta mengubah tipe subjek dari/ke `ante_mortem`), hanya `admin` yang diizinkan; role lain mendapat **403** *"Data ante-mortem hanya dapat dikelola oleh admin"*.

> *Catatan Desain:*
> - Seluruh operasi pembaruan menggunakan HTTP method **`PUT`** (bukan `PATCH`).
> - Slot citra intraoral terikat oleh constraint unik `(subject_id, view_type)`. Slot yang telah di-*soft-delete* terkunci permanen demi integritas *chain-of-custody* forensik (upload ulang ke slot tersebut menghasilkan **409 Conflict**).
> - Untuk skema request body, parameter query, dan format response terperinci, silakan merujuk langsung ke **Swagger UI** (`/docs`).

---

### 9. Integrasi AI Microservice

AI pipeline (deteksi gigi Faster R-CNN, landmark HRNet-W32, embedding Siamese Network) berjalan sebagai **microservice terpisah** milik tim Komputer-AI (default `http://localhost:8100`), bukan di dalam proses backend.

Alur inferensi:
1. Klien memanggil `POST /api/v1/inference/trigger` dengan `dental_image_id`.
2. Backend membuat *presigned URL* MinIO untuk citra, menyimpan row `inference_jobs` berstatus `pending`, lalu langsung mengembalikan **202 Accepted**.
3. *Background task* mengirim permintaan ke AI service (header `X-API-Key`) dan melakukan **polling** status secara berkala (`AI_SERVICE_POLL_INTERVAL_SECONDS`, maksimum `AI_SERVICE_MAX_POLL_ATTEMPTS` kali).
4. Saat job `completed`, hasil disimpan otomatis ke tabel `tooth_records` (deteksi per gigi) dan `embeddings` (vektor 512-dimensi per subjek). Bila AI service tidak dapat dihubungi atau timeout, job ditandai `failed` beserta `error_message`.
5. Klien memantau status melalui `GET /api/v1/inference/jobs/{job_id}`.

Seluruh asumsi format request/response AI service diisolasi di `services/ai_service_client.py`, sehingga perubahan kontrak AI tidak memengaruhi model, skema DB, maupun router.

---

### 10. Status Pengembangan

Status pengerjaan backend saat ini berada pada **Fase 3 — Integrasi AI ke API**:

- ✅ **Fase 1:** Infrastruktur dasar (Docker Compose, PostgreSQL 17 + `pgvector`, ChromaDB, MinIO).
- ✅ **Fase 2:** FastAPI, koneksi database asinkron, JWT Authentication & RBAC, *Tamper-Evident Audit Logging* berbasis SHA-256 *hash-chaining*.
- ✅ **Fase 3 (sebagian):**
  - MinIO storage service, CRUD subjek AM/PM, manajemen & upload citra intraoral dengan *presigned URL*.
  - Tabel `inference_jobs`, endpoint trigger & status job, background polling AI microservice, serta penyimpanan otomatis hasil ke `tooth_records` dan `embeddings`.
  - Manajemen pengguna admin-only, pembatasan data AM khusus admin, endpoint hasil deteksi per gigi.
  - CORS dan integrasi frontend untuk login, manajemen user, input data PM & AM, dan analisis per gigi.
- 🔄 **Langkah Berikutnya:**
  1. Uji koneksi live dengan AI microservice dan penguncian kontrak output AI (format embedding, bbox, morfologi).
  2. Endpoint matching & *similarity search* AM vs PM (`matching_results`, pgvector cosine similarity).
  3. Konfirmasi hasil oleh examiner (*human-in-the-loop*) dan generasi laporan INTERPOL DVI.
  4. Mekanisme delta-sync offline-to-cloud untuk scanner (ESP32-S3).
  5. **Fase 4:** enkripsi AES-256 (*at rest*), TLS 1.3 (*in transit*), rotasi kredensial, dan deployment ke server lokal kampus.

---

### 11. Testing

Backend dilengkapi test suite berbasis modul `unittest` Python. Sebagian besar test adalah **integration test terhadap server yang sedang berjalan** di `http://127.0.0.1:8000`.

**Prasyarat sebelum menjalankan test:**
1. Container Docker aktif dan seluruh skema (§5.4) sudah dijalankan.
2. Server FastAPI berjalan (`uvicorn main:app --reload`).
3. Akun admin hasil seed memakai password **`admin123`** (`SEED_ADMIN_PASSWORD=admin123` di lingkungan development) — kredensial ini dipakai oleh test. Jangan gunakan password ini di lingkungan produksi.

**Jalankan seluruh test suite:**
```bash
cd app/backend
python -m unittest discover tests
```

**Jalankan test tertentu:**
```bash
python -m unittest tests/test_users.py
```

| Berkas | Cakupan |
|---|---|
| `test_auth.py` | Login, profil user, akses tanpa/dengan token |
| `test_subject.py` | CRUD subjek |
| `test_phase3.py` | End-to-end CRUD subjek, upload citra multipart, soft-delete, RBAC, audit |
| `test_inference.py` | Trigger inferensi (202), status job, 404 citra/job, citra soft-deleted, 401 |
| `test_users.py` | Manajemen user admin-only: buat, duplikat, validasi, reset password, nonaktif, pengaman admin terakhir |
| `test_am_access.py` | Pembatasan data AM khusus admin & cascade soft-delete citra saat subjek dihapus |
| `test_tooth_records.py` | Endpoint hasil deteksi per gigi |

> Test yang membuat akun (`test_users.py`, `test_am_access.py`) menonaktifkan akun tersebut di akhir test, bukan menghapusnya — sesuai desain sistem yang tidak memiliki operasi DELETE untuk user.

---

### 12. Catatan Deployment

- **Target Deployment:** Server lokal laboratorium/kampus (on-premise LAN), bukan cloud provider publik.
- **Kredensial Produksi:** Sebelum sistem di-deploy ke server kampus, seluruh kredensial development lokal pada file `.env` (kata sandi PostgreSQL, MinIO root credentials, kata sandi akun admin awal, `AI_SERVICE_API_KEY`, dan `JWT_SECRET_KEY` yang default-nya masih `CHANGE_ME_IN_PRODUCTION`) **WAJIB** diganti dengan nilai yang aman, acak, dan memiliki entropi tinggi.
- **CORS:** Sesuaikan `CORS_ORIGINS` dengan alamat frontend di server deployment.
- **Penyimpanan Berkas .env:** Jangan pernah menyertakan atau melakukan commit berkas `.env` asli ke repositori Git. Gunakan selalu file `.env.example` sebagai acuan struktur variabel.

---

## Frontend

> Dokumentasi rinci frontend (struktur komponen, halaman, desain UI) akan dilengkapi oleh tim frontend. Bagian ini hanya mencakup cara menjalankan dan menghubungkannya ke backend.

**Stack:** React 18 · Vite 5 · Tailwind CSS 3 · React Router 6 · lucide-react. Kode berada di `app/frontend/`.

### Menjalankan

1. Pastikan backend sudah berjalan di `http://127.0.0.1:8000` (lihat bagian Backend).
2. Buat berkas environment frontend:
   ```bash
   cp app/frontend/.env.example app/frontend/.env
   ```
   ```env
   # Base URL backend FastAPI (tanpa trailing slash)
   VITE_API_BASE_URL=http://127.0.0.1:8000
   ```
3. Instal dependensi dan jalankan dev server:
   ```bash
   cd app/frontend
   npm install
   npm run dev      # http://localhost:5173
   npm run build    # output produksi ke dist/
   ```
4. Login memakai akun admin hasil seed (§5.6). Akun lain dibuat oleh admin di menu **Manajemen user**.

### Halaman & Status Integrasi

| Route | Halaman | Akses | Status |
|---|---|---|---|
| `/login` | Login | Publik | Terintegrasi (JWT) |
| `/dashboard` | Dashboard | Semua role | Masih data statis — menunggu endpoint matching |
| `/identify` | Input data post-mortem (subjek → upload → inferensi AI) | Semua role (upload: admin & examiner) | Terintegrasi; panel kandidat AM masih simulasi |
| `/analysis` | Hasil deteksi per gigi (citra + overlay bbox FDI) | Semua role | Terintegrasi sebagian |
| `/review` | Review hasil pencocokan | Semua role | Belum terintegrasi — menunggu endpoint matching |
| `/am-records` | Input data ante-mortem | `admin` | Terintegrasi |
| `/users` | Manajemen user | `admin` | Terintegrasi |

Bagian UI yang masih memakai data simulasi ditandai badge **"DATA SIMULASI"**.

> **Catatan:** Berkas di root `app/frontend/` (`api.js`, `Dropzone.jsx`, `Identify.jsx`, `Landing.jsx`) adalah salinan lama yang **tidak dipakai**. Kode aktif berada di `app/frontend/src/`.
