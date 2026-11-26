-- =====================================================================
-- Dentify: Skema PostgreSQL Tambahan — Fase 6 (Pencocokan per sudut)
--
-- Masalah: pencocokan lama membandingkan RATA-RATA embedding 3 sudut PM dengan
-- rata-rata 3 sudut AM → foto depan PM ikut "dibandingkan" dengan foto kiri/kanan AM.
-- Diagnostik 26 Nov (PM uji = foto Gangsar yang dikotori): cara lama memilih kandidat
-- salah dengan selisih 0,0005; perbandingan sudut yang sama memilih Gangsar (2 dari 3 sudut).
--
-- Cara baru: PM sudut X hanya dibandingkan dengan AM sudut X; skor kandidat =
-- rata-rata cosine sudut yang sama (services/view_matching.py).
--
-- 1. view_embeddings  : 1 embedding 512-dim per citra aktif (= subject_embedding job
--                       inferensi terbaru yang berlaku untuk citra itu), di-backfill di bawah
--                       dari inference_jobs.result_payload → AI tidak perlu dijalankan ulang.
-- 2. matching_results : rincian skor per sudut (view_scores), jumlah sudut yang dibandingkan,
--                       metode (NULL = baris lama, rata-rata embedding subjek).
-- Tabel `embeddings` (rata-rata per subjek) tetap ada & tetap diperbarui, tetapi tidak
-- dipakai lagi untuk peringkat.
--
-- Idempoten — aman dijalankan ulang (backfill memakai ON CONFLICT). Jalankan sebagai dentify_admin:
--   Laptop: Get-Content schema_phase6_view_matching.sql | docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db
--   Server: sudo -u postgres psql -d dentify_db -v ON_ERROR_STOP=1 -c "SET ROLE dentify_admin;" -f schema_phase6_view_matching.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS view_embeddings (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dental_image_id  UUID NOT NULL UNIQUE REFERENCES dental_images(id) ON DELETE CASCADE,
    subject_id       UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    view_type        view_type_enum NOT NULL,
    vector           vector(512) NOT NULL,
    model_version    VARCHAR(50) NOT NULL,
    generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_view_embeddings_view_subject ON view_embeddings(view_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_view_embeddings_subject ON view_embeddings(subject_id);

ALTER TABLE matching_results
    ADD COLUMN IF NOT EXISTS view_scores    JSONB,         -- {"depan": {"cos": 0.9371, "rank": 1}, ...}
    ADD COLUMN IF NOT EXISTS views_compared SMALLINT,      -- jumlah sudut yang dibandingkan
    ADD COLUMN IF NOT EXISTS match_method   VARCHAR(20);   -- 'per_view' (NULL = metode lama)

-- Backfill: job completed terbaru yang BERLAKU per citra aktif (analisis ulang yang belum
-- dikonfirmasi tidak dipakai) — aturan sama dengan services/subject_embedding.py.
INSERT INTO view_embeddings (dental_image_id, subject_id, view_type, vector, model_version, generated_at)
SELECT DISTINCT ON (j.dental_image_id)
       j.dental_image_id,
       d.subject_id,
       d.view_type,
       (j.result_payload -> 'subject_embedding')::text::vector,
       LEFT(COALESCE(NULLIF(j.result_payload ->> 'subject_embedding_model', ''), 'ai_engine'), 50),
       COALESCE(j.completed_at, NOW())
FROM inference_jobs j
JOIN dental_images d ON d.id = j.dental_image_id
WHERE d.is_deleted = FALSE
  AND j.status = 'completed'
  AND jsonb_typeof(j.result_payload -> 'subject_embedding') = 'array'
  AND jsonb_array_length(j.result_payload -> 'subject_embedding') = 512
  AND (
        j.request_payload IS NULL
        OR NOT (j.request_payload ? 'reanalysis')
        OR j.request_payload -> 'reanalysis' ->> 'review' = 'confirmed'
      )
ORDER BY j.dental_image_id, j.completed_at DESC NULLS LAST
ON CONFLICT (dental_image_id) DO UPDATE
    SET subject_id    = EXCLUDED.subject_id,
        view_type     = EXCLUDED.view_type,
        vector        = EXCLUDED.vector,
        model_version = EXCLUDED.model_version,
        generated_at  = EXCLUDED.generated_at;
