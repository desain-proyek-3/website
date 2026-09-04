-- =====================================================================
-- Dentify: Skema PostgreSQL #1 (Intraoral Image DB)
-- Fase 1: Setup DB + Vector Store
-- Backend: FastAPI + SQLAlchemy/asyncpg
-- =====================================================================
-- Catatan setup:
-- - Dikembangkan lokal dulu (laptop), akan dimigrasi ke Docker di server
--   lokal kampus/lab pada fase deployment (Fase 4).
-- - Ekstensi pgvector WAJIB terinstal sebelum menjalankan script ini.
--   Instalasi (contoh Ubuntu/Debian): apt install postgresql-16-pgvector
--   Atau via Docker image: pgvector/pgvector:pg16
-- - Index untuk kolom vector (HNSW/IVFFlat) SENGAJA belum ditambahkan.
--   Tambahkan nanti setelah volume data lebih besar, contoh:
--   CREATE INDEX ON embeddings USING hnsw (vector vector_cosine_ops);
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ekstensi
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------
-- ENUM Types
-- ---------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('admin', 'examiner', 'viewer');
CREATE TYPE subject_type_enum AS ENUM ('ante_mortem', 'post_mortem');
CREATE TYPE view_type_enum AS ENUM ('depan', 'kiri', 'kanan');
CREATE TYPE preprocessing_status_enum AS ENUM ('raw', 'processed', 'failed');
CREATE TYPE matching_status_enum AS ENUM ('pending_review', 'confirmed', 'rejected');

-- ---------------------------------------------------------------------
-- 1. users
-- Akun sistem: admin, examiner, viewer
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(50) NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            user_role NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. subjects
-- Entitas orang, baik AM (ante-mortem) maupun PM (post-mortem)
-- ---------------------------------------------------------------------
CREATE TABLE subjects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_type    subject_type_enum NOT NULL,
    full_name       VARCHAR(255),              -- nullable, PM bisa "unknown"
    case_reference  VARCHAR(100),               -- nomor kasus/insiden
    notes           TEXT,                       -- riwayat medis/catatan bebas
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subjects_type ON subjects(subject_type);
CREATE INDEX idx_subjects_case_reference ON subjects(case_reference);

-- ---------------------------------------------------------------------
-- 3. dental_images
-- 3 foto intraoral per subject: depan, kiri, kanan
-- File fisik disimpan di MinIO, kolom ini hanya referensi + metadata
-- ---------------------------------------------------------------------
CREATE TABLE dental_images (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id              UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    view_type               view_type_enum NOT NULL,
    file_path               TEXT NOT NULL,         -- referensi object key di MinIO
    file_hash               VARCHAR(64) NOT NULL,  -- SHA-256, chain-of-custody
    device_id               VARCHAR(100),           -- device_id dari NFC scanner (opsional)
    preprocessing_status    preprocessing_status_enum NOT NULL DEFAULT 'raw',
    captured_at             TIMESTAMPTZ,
    uploaded_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_subject_view UNIQUE (subject_id, view_type)
);

CREATE INDEX idx_dental_images_subject ON dental_images(subject_id);

-- ---------------------------------------------------------------------
-- 4. tooth_records
-- Hasil deteksi per gigi (Faster R-CNN + HRNet), granularitas per FDI
-- ---------------------------------------------------------------------
CREATE TABLE tooth_records (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dental_image_id         UUID NOT NULL REFERENCES dental_images(id) ON DELETE CASCADE,
    fdi_number              SMALLINT NOT NULL CHECK (fdi_number BETWEEN 11 AND 48),
    bbox                    JSONB,          -- {x, y, width, height}
    mask_data               JSONB,          -- opsional: mask segmentasi
    landmarks               JSONB,          -- array 6 titik anatomi (HRNet-W32)
    morphology_features     JSONB,          -- diastema, rotasi, restorasi, missing, crowding
    confidence_score        REAL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tooth_records_image ON tooth_records(dental_image_id);
CREATE INDEX idx_tooth_records_fdi ON tooth_records(fdi_number);

-- ---------------------------------------------------------------------
-- 5. embeddings
-- Output Siamese Network: 1 embedding 512-dim per subject
-- (gabungan hasil dari 3 foto: depan, kiri, kanan)
-- ---------------------------------------------------------------------
CREATE TABLE embeddings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id      UUID NOT NULL UNIQUE REFERENCES subjects(id) ON DELETE CASCADE,
    vector          vector(512) NOT NULL,
    model_version   VARCHAR(50) NOT NULL,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now()

    -- Index similarity search (HNSW/IVFFlat) SENGAJA belum dibuat.
    -- Tambahkan nanti, contoh:
    -- CREATE INDEX ON embeddings USING hnsw (vector vector_cosine_ops);
);

-- ---------------------------------------------------------------------
-- 6. matching_results
-- Hasil pencocokan AM vs PM (Matching Engine)
-- ---------------------------------------------------------------------
CREATE TABLE matching_results (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pm_subject_id               UUID NOT NULL REFERENCES subjects(id),
    am_subject_id                UUID NOT NULL REFERENCES subjects(id),
    cosine_similarity            REAL,
    superimposition_score        REAL,
    morphology_diff_score        REAL,
    confidence_score             REAL,
    rank                         SMALLINT,       -- ranking kandidat dalam hasil 1:N
    matched_by                   UUID REFERENCES users(id),
    status                        matching_status_enum NOT NULL DEFAULT 'pending_review',
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_pm_is_post_mortem CHECK (pm_subject_id != am_subject_id)
);

CREATE INDEX idx_matching_pm ON matching_results(pm_subject_id);
CREATE INDEX idx_matching_am ON matching_results(am_subject_id);
CREATE INDEX idx_matching_status ON matching_results(status);

-- =====================================================================
-- DITUNDA KE FASE YANG AKAN DATANG
-- =====================================================================
-- Tabel: identification_reports
-- Fungsi: menyimpan output Agentic RAG
-- Rencana kolom:
--   id                  UUID PK
--   matching_result_id  FK -> matching_results
--   report_content      JSONB/TEXT (hasil generate agent synthesizer)
--   references          JSONB (rujukan jurnal odontologi & standar),
--                        hasil retrieval ChromaDB)
--   reviewed_by         FK -> users (forensic examiner yang validasi)
--   status               enum: draft, reviewed, finalized
--   generated_at, finalized_at
-- =====================================================================
