-- Persistent in-app reminders; existing activity history is not converted into schedules.
CREATE TABLE IF NOT EXISTS activity_reminders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    siklus_tanam_id INT NOT NULL,
    jenis_aktivitas ENUM('pemupukan', 'pengobatan') NOT NULL,
    tanggal_rencana DATE NOT NULL,
    nama_material VARCHAR(255) NULL,
    catatan VARCHAR(1000) NULL,
    status ENUM('terjadwal', 'selesai', 'dibatalkan') NOT NULL DEFAULT 'terjadwal',
    created_by INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_reminder_cycle FOREIGN KEY (siklus_tanam_id) REFERENCES siklus_tanam(id) ON DELETE CASCADE,
    CONSTRAINT fk_reminder_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_reminder_cycle (siklus_tanam_id),
    INDEX idx_reminder_due (status, tanggal_rencana)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(32) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'in_app',
    title VARCHAR(255) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    related_entity_type VARCHAR(32) NOT NULL,
    related_entity_id INT NOT NULL,
    event_date DATE NOT NULL,
    scheduled_at DATETIME NOT NULL,
    read_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_notification_event (user_id, type, related_entity_type, related_entity_id, event_date, scheduled_at),
    INDEX idx_notification_unread (user_id, read_at, cancelled_at, scheduled_at),
    INDEX idx_notification_list (user_id, cancelled_at, scheduled_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
