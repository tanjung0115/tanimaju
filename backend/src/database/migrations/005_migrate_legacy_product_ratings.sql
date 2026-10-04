-- Preserve legacy products.rating values when that column exists.
-- The migration is intentionally non-destructive; the legacy column is retained.
SET @legacy_rating_sql = (
    SELECT IF(
        COUNT(*) > 0,
        'INSERT IGNORE INTO product_ratings (product_id, user_identifier, rating) SELECT id, ''legacy'', rating FROM products WHERE rating IS NOT NULL AND rating > 0',
        'SELECT 1'
    )
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'rating'
);

PREPARE legacy_rating_statement FROM @legacy_rating_sql;
EXECUTE legacy_rating_statement;
DEALLOCATE PREPARE legacy_rating_statement;

UPDATE products p
SET
    average_rating = COALESCE((SELECT AVG(pr.rating) FROM product_ratings pr WHERE pr.product_id = p.id), 0),
    total_ratings = (SELECT COUNT(*) FROM product_ratings pr WHERE pr.product_id = p.id);
