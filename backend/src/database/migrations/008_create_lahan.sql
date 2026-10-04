-- Land entity owned by a petani profile.
CREATE TABLE IF NOT EXISTS lahan (
    id INT AUTO_INCREMENT PRIMARY KEY,
    petani_id INT NOT NULL,
    nama_lahan VARCHAR(255) NOT NULL,
    luas DECIMAL(12,2) NOT NULL COMMENT 'Area in hectares',
    lokasi VARCHAR(500),
    status ENUM('produktif', 'tidak produktif') NOT NULL DEFAULT 'produktif',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_lahan_petani FOREIGN KEY (petani_id) REFERENCES petani(id) ON DELETE RESTRICT,
    INDEX idx_lahan_petani_id (petani_id),
    INDEX idx_lahan_status (status),
    UNIQUE KEY unique_lahan_per_petani (petani_id, nama_lahan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
