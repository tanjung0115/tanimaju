-- DEPRECATED and destructive: retained only as historical reference.
-- Never run against production without a verified backup and explicit approval.
-- Migration: Drop unused 'rating' column from products table
-- The rating system now uses average_rating and total_ratings columns
-- which are calculated from the product_ratings table

-- Drop the rating column
ALTER TABLE products DROP COLUMN rating;

