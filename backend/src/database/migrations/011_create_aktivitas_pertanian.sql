-- Generic agricultural events belonging to a crop cycle.
CREATE TABLE IF NOT EXISTS aktivitas_pertanian (
    id INT AUTO_INCREMENT PRIMARY KEY,
    siklus_tanam_id INT NOT NULL,
    panen_id INT NULL,
    jenis_aktivitas ENUM('penanaman', 'pemupukan', 'pengobatan', 'monitoring') NOT NULL,
    tanggal DATE NOT NULL,
    nama_material VARCHAR(255) NULL,
    dosis DECIMAL(12,2) NULL,
    satuan VARCHAR(50) NULL,
    tujuan VARCHAR(500) NULL,
    kondisi VARCHAR(500) NULL,
    catatan TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_aktivitas_siklus FOREIGN KEY (siklus_tanam_id) REFERENCES siklus_tanam(id) ON DELETE CASCADE,
    CONSTRAINT fk_aktivitas_panen FOREIGN KEY (panen_id) REFERENCES panen(id) ON DELETE SET NULL,
    INDEX idx_aktivitas_siklus_id (siklus_tanam_id),
    INDEX idx_aktivitas_panen_id (panen_id),
    INDEX idx_aktivitas_jenis (jenis_aktivitas),
    INDEX idx_aktivitas_tanggal (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
