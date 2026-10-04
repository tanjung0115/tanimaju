-- Optional link from existing/new harvest records to a crop cycle.
ALTER TABLE panen
    ADD COLUMN IF NOT EXISTS siklus_tanam_id INT NULL,
    ADD INDEX idx_panen_siklus_tanam_id (siklus_tanam_id),
    ADD CONSTRAINT fk_panen_siklus_tanam FOREIGN KEY (siklus_tanam_id) REFERENCES siklus_tanam(id) ON DELETE SET NULL;

-- Existing harvest records remain unlinked until reviewed explicitly.
