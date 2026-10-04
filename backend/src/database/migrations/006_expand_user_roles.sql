-- Expand roles without removing the legacy user value or changing existing rows.
ALTER TABLE users
    MODIFY COLUMN role ENUM('admin', 'user', 'petani', 'penyuluh') NOT NULL DEFAULT 'petani';