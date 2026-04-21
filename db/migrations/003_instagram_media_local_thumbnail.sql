-- Store a locally-mirrored poster/thumbnail for each media row so video
-- posts (and any image post whose primary download failed) can always
-- render a cover from our own domain instead of an Instagram CDN URL.

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = 'instagram_media') > 0
  AND
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'instagram_media'
       AND column_name = 'local_thumbnail_path') = 0,
  'ALTER TABLE instagram_media ADD COLUMN local_thumbnail_path VARCHAR(1024) NULL AFTER local_path',
  'DO 0'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
