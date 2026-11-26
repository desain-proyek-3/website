-- =====================================================================
-- Dentify: Skema PostgreSQL Tambahan — Fase 5 (Analisis AI laporan identifikasi)
-- Scope: menyimpan narasi Agentic RAG (Bagian 4 "Analisis AI" laporan INTERPOL DVI)
-- per pasangan PM–AM yang sudah dikonfirmasi.
--
-- Narasi dibuat SEKALI lewat POST /api/v1/matching-results/{id}/report/narrative lalu
-- dipakai ulang setiap laporan dibuka/dicetak → isi analisis di PDF selalu sama
-- (LLM menghasilkan teks berbeda di tiap panggilan). Hanya hasil sukses yang disimpan.
--
-- Idempoten — aman dijalankan ulang. Jalankan sebagai dentify_admin (pemilik tabel):
--   Laptop: Get-Content schema_phase5_report_narrative.sql | docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db
--   Server: sudo -u postgres psql -d dentify_db -c "SET ROLE dentify_admin;" -f schema_phase5_report_narrative.sql
-- =====================================================================

ALTER TABLE matching_results
    ADD COLUMN IF NOT EXISTS report_narrative    JSONB,         -- {content, references[], engine, warnings[], model_version}
    ADD COLUMN IF NOT EXISTS report_narrative_at TIMESTAMPTZ;   -- waktu narasi dibuat
