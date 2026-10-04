-- Compatibility migration for session-based authentication.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS session_key VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS session_expired_at DATETIME NULL;
