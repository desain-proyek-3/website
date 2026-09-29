-- =====================================================================
-- Dentify: Skema PostgreSQL Tambahan — Fase 3 (Minggu ke-berapa, sesuaikan)
-- Scope: Penyesuaian minor untuk mendukung CRUD subjects & dental_images
-- File ini HANYA menambah kolom yang diperlukan untuk soft-delete
-- (chain-of-custody: data forensik tidak boleh dihapus permanen).
-- =====================================================================

-- Soft-delete untuk subjects
ALTER TABLE subjects
    ADD COLUMN IF NOT EXISTS is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by   UUID REFERENCES users(id);

-- Soft-delete untuk dental_images
ALTER TABLE dental_images
    ADD COLUMN IF NOT EXISTS is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by   UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_subjects_is_deleted ON subjects(is_deleted);
CREATE INDEX IF NOT EXISTS idx_dental_images_is_deleted ON dental_images(is_deleted);