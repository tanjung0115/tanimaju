-- Create the current per-user rating model without removing legacy rating data.
CREATE TABLE IF NOT EXISTS product_ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    user_identifier VARCHAR(255) NOT NULL,
    rating FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_rating_value CHECK (rating >= 0 AND rating <= 5),
    CONSTRAINT fk_product_rating_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_product (product_id, user_identifier),
    INDEX idx_product_id (product_id),
    INDEX idx_user_identifier (user_identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS average_rating FLOAT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_ratings INT DEFAULT 0;

UPDATE products p
SET
    average_rating = COALESCE((SELECT AVG(pr.rating) FROM product_ratings pr WHERE pr.product_id = p.id), 0),
    total_ratings = (SELECT COUNT(*) FROM product_ratings pr WHERE pr.product_id = p.id);
