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
- **ASGI Server:** Uvicorn.
- **Containerization:** Docker & Docker Compose untuk orkestrasi *service* pendukung (PostgreSQL, ChromaDB, MinIO).

---

### 3. Struktur Folder Backend

Seluruh kode sumber backend berada di dalam direktori `app/backend/`:

```
app/backend/
├── alembic/                # Konfigurasi migrasi database Alembic (opsional/persiapan)
├── alembic.ini             # File inisialisasi Alembic
├── api/                    # Definisi router dan endpoint REST API
│   └── v1/
│       ├── audit.py        # Endpoint audit log dan verifikasi integritas chain
│       ├── auth.py         # Endpoint autentikasi (login, me)
│       ├── dental_images.py# Endpoint upload dan manajemen citra intraoral
│       ├── router.py       # Penggabung seluruh sub-router API v1
│       └── subjects.py     # Endpoint CRUD data subjek AM dan PM
├── core/                   # Konfigurasi inti aplikasi
│   ├── config.py           # Pydantic BaseSettings untuk pembacaan environment variables
│   ├── database.py         # Setup async engine SQLAlchemy, session factory, dan health check DB
│   └── security.py         # Hashing password (bcrypt) dan utilitas encode/decode JWT
├── dependencies/           # FastAPI dependency injection
│   └── auth.py             # Verifikasi token JWT dan penegakan RBAC (require_role)
├── middleware/             # HTTP middleware
│   └── audit_middleware.py # AuditLogMiddleware (pencatatan otomatis request tanpa latensi)
├── models/                 # Definisi tabel SQLAlchemy ORM
│   ├── __init__.py         # Registrasi seluruh model ke Base.metadata
│   ├── audit_log.py        # Model audit_logs (hash-chaining)
│   ├── dental_image.py     # Model dental_images (relasi subjek, MinIO path, SHA-256)
│   ├── embedding.py        # Model embeddings (vektor pgvector 512-dimensi)
│   ├── matching_result.py  # Model matching_results (skor kecocokan AM-PM)
│   ├── subject.py          # Model subjects (data korban/kasus AM & PM)
│   ├── tooth_record.py     # Model tooth_records (status odontogram per gigi FDI)
│   └── user.py             # Model users (pengguna sistem dan RBAC)
├── schemas/                # Validasi data & serialisasi Pydantic
│   ├── audit.py            # Skema response audit log dan status verifikasi chain
│   ├── dental_image.py     # Skema citra intraoral (metadata dan presigned URL)
│   ├── subject.py          # Skema create, update, dan response subjek
│   └── user.py             # Skema login, token, dan user profile
├── scripts/                # Script otomasi dan utilitas
│   └── seed_admin.py       # Script pembuatan akun administrator awal
├── services/               # Lapisan logika bisnis
│   ├── audit_service.py    # Logika pembuatan hash-chain audit dan verifikasi integritas
│   ├── auth_service.py     # Logika autentikasi kredensial pengguna
│   └── storage_service.py  # Wrapper MinIO SDK (upload, bucket check, presigned URL)
├── tests/                  # Test suite terotomasi
│   ├── test_auth.py        # Pengujian endpoint autentikasi & profil
│   ├── test_phase3.py      # Pengujian integrasi end-to-end (CRUD, upload citra, RBAC, audit)
│   └── test_subject.py     # Pengujian fungsionalitas CRUD subjek
├── main.py                 # Entry point aplikasi FastAPI (lifespan & middleware setup)
├── requirements.txt        # Daftar dependensi Python
├── .env.example            # Template variabel lingkungan untuk FastAPI
└── .env                    # Variabel lingkungan lokal (diabaikan oleh git)
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

> **Catatan untuk Pengguna Windows:** Jika memiliki instalasi PostgreSQL native di Windows, pastikan layanan `postgresql-x64-<versi>` dihentikan via `services.msc` agar tidak terjadi bentrok alokasi port `5432` dengan container Docker.

---

### 5. Cara Setup & Menjalankan (Getting Started)

Ikuti langkah-langkah berikut secara berurutan:

#### 5.1 Clone Repository
```bash
git clone <URL_REPOSITORY_DENTIFY>
cd website
```

#### 5.2 Konfigurasi Environment Variables (`.env`)
Sistem menggunakan **dua file `.env` berbeda** untuk memisahkan konfigurasi container dan runtime backend:

1. **`.env` pada Root (`website/.env`):**
   Digunakan secara khusus oleh Docker Compose untuk menginisialisasi container PostgreSQL, ChromaDB, dan MinIO. Salin atau buat file `.env` di root direktori:
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
   Buka `app/backend/.env` dan lengkapi nilainya:
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

   JWT_SECRET_KEY=<generate_random_secret_min_32_chars>
   JWT_ALGORITHM=HS256
   JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60

   SEED_ADMIN_PASSWORD=<your_initial_admin_password>

   APP_NAME=Dentify API
   APP_VERSION=0.1.0
   DEBUG=True
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
Skema database dijalankan secara bertahap untuk memastikan seluruh tabel, constraint, dan ekstensi terkonfigurasi:

- **Linux / macOS (Bash):**
  ```bash
  docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db < schema_phase1.sql
  docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db < schema_phase2_audit.sql
  docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db < schema_phase3.sql
  ```

- **Windows (PowerShell):**
  ```powershell
  Get-Content schema_phase1.sql | docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db
  Get-Content schema_phase2_audit.sql | docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db
  Get-Content schema_phase3.sql | docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db
  ```

> *Urutan skema:*
> 1. `schema_phase1.sql`: Skema 6 tabel inti DVI + ekstensi `vector` (pgvector).
> 2. `schema_phase2_audit.sql`: Tabel `audit_logs` untuk pencatatan *tamper-evident*.
> 3. `schema_phase3.sql`: Kolom *soft-delete* (`is_deleted`, `deleted_at`, `deleted_by`) pada tabel `subjects` dan `dental_images`.

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
Jalankan script seed untuk membuat akun administrator pertama:
```bash
python scripts/seed_admin.py
```
*Script ini akan membuat akun admin dengan kredensial yang ditentukan oleh variabel `SEED_ADMIN_PASSWORD` pada `app/backend/.env` (default username: `admin`).*

#### 5.7 Menjalankan Server FastAPI
Jalankan server pengembangan FastAPI dari direktori `app/backend/`:
```bash
cd app/backend
uvicorn main:app --reload
```

> ⚠️ **PERINGATAN PENTING:** Jalankan perintah `uvicorn main:app --reload` tepat dari dalam direktori `app/backend/`. **JANGAN** menjalankan `uvicorn app.main:app` dari root, karena akan menyebabkan `ModuleNotFoundError` pada modul internal.

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

> ⚠️ **Catatan Khusus Port ChromaDB:** Port host ChromaDB dialihkan ke **`8001`** (bukan default `8000`) untuk mencegah bentrok jaringan dengan server FastAPI yang berjalan di port `8000`. Container ChromaDB tetap mendengarkan port internal `8000` (`8001:8000`).

---

### 7. Autentikasi & Kontrol Akses (RBAC)

Backend mengadopsi skema otentikasi stateless menggunakan **JWT (JSON Web Token)** dengan pengelompokan 3 hak akses pengguna (*Role-Based Access Control*):

1. **`admin`**: Hak akses menyeluruh terhadap sistem, termasuk verifikasi integritas audit trail dan manajemen pengguna.
2. **`examiner`**: Odontolog forensik atau teknisi medis yang memiliki izin memasukkan/memperbarui data subjek AM/PM dan mengunggah citra klinis.
3. **`viewer`**: Personel peninjau dengan izin baca-saja (*read-only*) untuk meninjau data subjek dan citra tanpa wewenang mutasi data.

#### Alur Penggunaan Token:
1. **Otentikasi Login:** Kirim permintaan `POST /api/v1/auth/login` dengan format URL-encoded form data (`username` dan `password`).
2. **Menerima Token:** Respons mengembalikan payload berupa:
   ```json
   {
     "access_token": "<jwt_access_token_string>",
     "token_type": "bearer",
     "expires_in": 3600
   }
   ```
3. **Otorisasi Request Lanjutan:** Sertakan token pada header HTTP setiap pemanggilan endpoint terproteksi:
   ```http
   Authorization: Bearer <jwt_access_token_string>
   ```

---

### 8. Daftar Endpoint API (Ringkas)

Berikut adalah ringkasan endpoint yang telah diimplementasikan:

| Modul | Method | Endpoint | Role | Fungsi Singkat |
|---|---|---|---|---|
| **System** | `GET` | `/health` | Publik | Health-check status koneksi database PostgreSQL |
| **System** | `GET` | `/` | Publik | Welcome message dan tautan dokumentasi |
| **Auth** | `POST` | `/api/v1/auth/login` | Publik | Otentikasi username & password, mengembalikan access token |
| **Auth** | `GET` | `/api/v1/auth/me` | Semua Role | Mengambil profil user yang sedang login dari token |
| **Subjects** | `POST` | `/api/v1/subjects` | `admin`, `examiner` | Pendaftaran subjek baru (*ante_mortem* / *post_mortem*) |
| **Subjects** | `GET` | `/api/v1/subjects` | Semua Role | Mengambil daftar subjek aktif (pagination & filter `subject_type`) |
| **Subjects** | `GET` | `/api/v1/subjects/{id}` | Semua Role | Mengambil detail lengkap satu subjek |
| **Subjects** | `PUT` | `/api/v1/subjects/{id}` | `admin`, `examiner` | Pembaruan data subjek secara utuh (*full update*) |
| **Subjects** | `DELETE`| `/api/v1/subjects/{id}` | `admin`, `examiner` | *Soft-delete* subjek (menandai `is_deleted=TRUE`) |
| **Dental Images**| `POST` | `/api/v1/dental-images/upload` | `admin`, `examiner` | Upload citra intraoral (`view_type`: depan/kiri/kanan) ke MinIO & DB |
| **Dental Images**| `GET` | `/api/v1/dental-images/{id}` | Semua Role | Detail metadata citra beserta *presigned URL* aktif |
| **Dental Images**| `DELETE`| `/api/v1/dental-images/{id}` | `admin`, `examiner` | *Soft-delete* citra (file fisik di MinIO tetap dipertahankan) |
| **Dental Images**| `GET` | `/api/v1/subjects/{id}/images` | Semua Role | Daftar seluruh citra intraoral aktif milik suatu subjek |
| **Audit** | `GET` | `/api/v1/audit/logs` | `admin`, `examiner` | Melihat riwayat jejak audit sistem |
| **Audit** | `GET` | `/api/v1/audit/verify` | `admin` | Verifikasi integritas kriptografis *hash-chain* log |

> *Catatan Desain:*
> - Sesuai standar arsitektur sistem Dentify, operasi modifikasi subjek menggunakan HTTP method **`PUT`** (bukan `PATCH`).
> - Slot citra intraoral terikat oleh constraint unik `(subject_id, view_type)`. Slot yang telah di-*soft-delete* terkunci permanen demi integritas *chain-of-custody* forensik.
> - Untuk skema request body, parameter query, dan format response terperinci, silakan merujuk langsung ke **Swagger UI** (`/docs`).

---

### 9. Status Pengembangan

Status pengerjaan backend saat ini berada pada **Fase 3 (Minggu ke-8 s.d. 12)**:

- ✅ **Fase 1 (Selesai):** Setup infrastruktur dasar (Docker Compose, PostgreSQL 17 + `pgvector`, ChromaDB, MinIO).
- ✅ **Fase 2 (Selesai):** Setup FastAPI, koneksi database asinkron, JWT Authentication & RBAC, serta sistem *Tamper-Evident Audit Logging* berbasis SHA-256 *hash-chaining*.
- ✅ **Fase 3 — Minggu 1 (Selesai):** Integrasi MinIO SDK & bucket auto-creation, implementasi REST API CRUD Subjek AM/PM, serta API manajemen dan upload citra intraoral dengan *presigned URL*.
- 🔄 **Langkah Berikutnya (Fase 3 Lanjutan):**
  1. **Integrasi AI Pipeline:** Implementasi tabel `inference_jobs` dan endpoint trigger/polling untuk menyambungkan backend dengan AI service (deteksi gigi Faster R-CNN, landmark HRNet, dan pencocokan biometrik Siamese Network).
  2. **Penyimpanan Hasil AI:** Expose endpoint penyimpanan hasil inferensi ke tabel `tooth_records`, `embeddings`, dan `matching_results`.
  3. **Mekanisme Delta-Sync:** Perancangan API sinkronisasi data batch offline-to-cloud untuk scanner hardware (ESP32-S3).

---

### 10. Testing

Backend dilengkapi dengan test suite terotomasi menggunakan modul `unittest` Python yang memvalidasi aliran autentikasi, integritas transaksi database, unggahan penyimpanan objek, dan audit logging secara end-to-end.

Pastikan container Docker dan server FastAPI telah menyala sebelum menjalankan integrasi test:

1. **Jalankan Seluruh Test Suite:**
   ```bash
   cd app/backend
   python -m unittest discover tests
   ```

2. **Jalankan Pengujian Tertentu:**
   - Test End-to-End Fase 3:
     ```bash
     python -m unittest tests/test_phase3.py
     ```
   - Test Autentikasi:
     ```bash
     python -m unittest tests/test_auth.py
     ```
   - Test CRUD Subjek:
     ```bash
     python -m unittest tests/test_subject.py
     ```

---

### 11. Catatan Deployment

- **Target Deployment:** Server lokal laboratorium/kampus (on-premise LAN), bukan cloud provider publik.
- **Kredensial Produksi:** Sebelum sistem di-deploy ke server kampus, seluruh kredensial development lokal pada file `.env` (kata sandi PostgreSQL, MinIO root credentials, kata sandi akun admin awal, dan `JWT_SECRET_KEY`) **WAJIB** diganti dengan nilai yang aman, acak, dan memiliki entropi tinggi.
- **Penyimpanan Berkas .env:** Jangan pernah menyertakan atau melakukan commit berkas `.env` asli ke repositori Git publik. Gunakan selalu file `.env.example` sebagai acuan struktur variabel.

---

## Frontend

> **Catatan:**
> Dokumentasi untuk modul Frontend (*React + Vite*) akan dilengkapi oleh tim frontend setelah tahap pengembangan antarmuka pengguna dimulai.
>
> *(TODO: Diisi oleh tim Frontend saat implementasi UI/UX berjalan).*