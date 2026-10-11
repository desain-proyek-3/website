-- =====================================================================
-- Dentify: Skema PostgreSQL Tambahan — Fase 3b (Inference Jobs)
-- Scope: Tabel pelacakan job inferensi ke AI microservice
-- =====================================================================

-- ENUM untuk status inference job
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inference_job_status_enum') THEN
        CREATE TYPE inference_job_status_enum AS ENUM (
            'pending', 'processing', 'completed', 'failed'
        );
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS inference_jobs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dental_image_id     UUID NOT NULL REFERENCES dental_images(id) ON DELETE CASCADE,
    subject_id          UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    status              inference_job_status_enum NOT NULL DEFAULT 'pending',
    ai_service_job_id   VARCHAR(255),          -- ID job dari AI microservice (diisi setelah trigger)
    request_payload     JSONB,                 -- payload yang dikirim ke AI service
    result_payload      JSONB,                 -- hasil inferensi dari AI service
    error_message       TEXT,                  -- pesan error jika status = failed
    retry_count         INT NOT NULL DEFAULT 0,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ            -- waktu job selesai (completed/failed)
);

CREATE INDEX IF NOT EXISTS idx_inference_jobs_dental_image ON inference_jobs(dental_image_id);
CREATE INDEX IF NOT EXISTS idx_inference_jobs_subject ON inference_jobs(subject_id);
CREATE INDEX IF NOT EXISTS idx_inference_jobs_status ON inference_jobs(status);
CREATE INDEX IF NOT EXISTS idx_inference_jobs_created_by ON inference_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_inference_jobs_created_at ON inference_jobs(created_at);
