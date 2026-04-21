-- Store the Apify item.displayUrl on the post row so every post has a
-- reliable preview image even when the media table is empty or its
-- first row's thumbnail_url is stale. The proxy streams this URL for
-- the feed/grid cover fallback.

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = 'instagram_posts') > 0
  AND
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'instagram_posts'
       AND column_name = 'display_url') = 0,
  'ALTER TABLE instagram_posts ADD COLUMN display_url VARCHAR(2048) NULL AFTER alt_text',
  'DO 0'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
