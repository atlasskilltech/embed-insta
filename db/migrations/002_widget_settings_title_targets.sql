-- Add title + targets_json columns to widget_settings so each widget
-- can have a human label and a per-widget list of Instagram targets.
-- Safe on fresh installs (widget_settings may not exist yet) and on
-- already-upgraded databases.

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = 'widget_settings') > 0
  AND
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'widget_settings'
       AND column_name = 'title') = 0,
  'ALTER TABLE widget_settings ADD COLUMN title VARCHAR(128) NULL AFTER name',
  'DO 0'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = 'widget_settings') > 0
  AND
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'widget_settings'
       AND column_name = 'targets_json') = 0,
  'ALTER TABLE widget_settings ADD COLUMN targets_json TEXT NULL AFTER title',
  'DO 0'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE widget_settings
   SET title = 'Default widget'
 WHERE name = 'default' AND (title IS NULL OR title = '');
