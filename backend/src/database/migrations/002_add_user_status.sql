-- Compatibility migration for databases created before status was in the schema.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved';

UPDATE users
SET status = 'approved'
WHERE status IS NULL;
