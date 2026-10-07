-- =====================================================================
-- Dentify: Skema PostgreSQL Tambahan (Audit Log Tamper-Evident)
-- Fase 2: Audit Logging dengan Cryptographic Hash-Chaining
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(100) NOT NULL,
    resource_id     UUID,
    method          VARCHAR(10) NOT NULL,
    endpoint        VARCHAR(255) NOT NULL,
    status_code     INT NOT NULL,
    ip_address      VARCHAR(45),
    details         JSONB,
    entry_hash      VARCHAR(64) NOT NULL,
    previous_hash   VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
