-- =====================================================================
-- Dentify: Skema PostgreSQL Tambahan — Fase 4 (Integrasi alat ESP32)
-- Scope: Pendaftaran alat (devices) & kotak masuk foto dari alat (device_captures).
--
-- Alur: alat mengirim foto (X-Device-Key) → device_captures berstatus 'pending'
-- (belum punya subjek) → examiner/admin memasangkannya ke subjek + sudut
-- → dibuat baris dental_images biasa, capture menjadi 'assigned'.
-- Hapus dari Inbox = soft delete ('discarded'); file tetap di MinIO (chain-of-custody).
--
-- Idempoten — aman dijalankan ulang:
--   Get-Content schema_phase4_device.sql | docker exec -i dentify_postgres psql -U dentify_admin -d dentify_db
-- =====================================================================

-- Alat yang boleh mengirim foto. API key mentah TIDAK disimpan, hanya SHA-256-nya
-- (key acak 32 byte → SHA-256 cukup; dibuat oleh scripts/create_device.py).
CREATE TABLE IF NOT EXISTS devices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_code     VARCHAR(100) NOT NULL UNIQUE,      -- mis. 'dentify-cam-01' (= DEVICE_ID di firmware)
    name            VARCHAR(255),
    api_key_hash    VARCHAR(64)  NOT NULL UNIQUE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_capture_status_enum') THEN
        CREATE TYPE device_capture_status_enum AS ENUM ('pending', 'assigned', 'discarded');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS device_captures (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id        UUID         NOT NULL REFERENCES devices(id),
    file_path        TEXT         NOT NULL,                -- object key MinIO: device-inbox/...
    file_hash        VARCHAR(64)  NOT NULL,                -- SHA-256, diverifikasi saat diterima
    file_size        INTEGER      NOT NULL,
    original_filename VARCHAR(255),
    view_type_hint   view_type_enum,                       -- opsional, dikirim alat
    captured_at      TIMESTAMPTZ,                          -- jam alat (NTP), opsional
    received_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    status           device_capture_status_enum NOT NULL DEFAULT 'pending',
    dental_image_id  UUID REFERENCES dental_images(id),    -- terisi saat 'assigned'
    assigned_by      UUID REFERENCES users(id),
    assigned_at      TIMESTAMPTZ,
    deleted_by       UUID REFERENCES users(id),            -- terisi saat 'discarded'
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_device_captures_status_received
    ON device_captures(status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_captures_device ON device_captures(device_id);
