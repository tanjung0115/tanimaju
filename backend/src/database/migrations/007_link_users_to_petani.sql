-- Link a petani profile to at most one user account.
-- Existing profiles remain unlinked with user_id = NULL.
ALTER TABLE petani
    ADD COLUMN IF NOT EXISTS user_id INT NULL,
    ADD UNIQUE KEY unique_petani_user (user_id),
    ADD CONSTRAINT fk_petani_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
