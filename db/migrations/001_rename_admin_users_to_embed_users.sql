-- Rename admin_users -> embed_users if only the old table exists.
-- Safe to run on fresh installs (no-op) and on already-migrated databases.

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'admin_users') > 0
  AND
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'embed_users') = 0,
  'RENAME TABLE admin_users TO embed_users',
  'DO 0'
);

PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
