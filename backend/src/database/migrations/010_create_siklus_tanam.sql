-- Crop cycle connecting a crop, land, and planting timeline.
CREATE TABLE IF NOT EXISTS siklus_tanam (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lahan_id INT NOT NULL,
    tanaman_id INT NOT NULL,
    tanggal_tanam DATE NOT NULL,
    luas_tanam DECIMAL(12,2) NULL COMMENT 'Area in hectares',
    perkiraan_tanggal_panen DATE NULL,
    status ENUM('aktif', 'selesai', 'dibatalkan') NOT NULL DEFAULT 'aktif',
    catatan TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_siklus_lahan FOREIGN KEY (lahan_id) REFERENCES lahan(id) ON DELETE RESTRICT,
    CONSTRAINT fk_siklus_tanaman FOREIGN KEY (tanaman_id) REFERENCES tanaman(id) ON DELETE RESTRICT,
    INDEX idx_siklus_lahan_id (lahan_id),
    INDEX idx_siklus_tanaman_id (tanaman_id),
    INDEX idx_siklus_tanggal_tanam (tanggal_tanam),
    INDEX idx_siklus_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
