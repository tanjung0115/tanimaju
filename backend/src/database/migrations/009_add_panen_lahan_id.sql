-- Link new harvest records to lahan while preserving the legacy text field.
ALTER TABLE panen
    ADD COLUMN IF NOT EXISTS lahan_id INT NULL,
    ADD INDEX idx_panen_lahan_id (lahan_id),
    ADD CONSTRAINT fk_panen_lahan FOREIGN KEY (lahan_id) REFERENCES lahan(id) ON DELETE SET NULL;

-- Existing panen.lahan values are intentionally not auto-mapped.
-- They require an explicit petani + lahan review before assignment.
