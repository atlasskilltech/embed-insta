-- Embed Insta schema

CREATE TABLE IF NOT EXISTS instagram_posts (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id         VARCHAR(64)  NOT NULL,
  shortcode       VARCHAR(64)  NULL,
  username        VARCHAR(128) NULL,
  owner_full_name VARCHAR(255) NULL,
  caption         TEXT         NULL,
  permalink       VARCHAR(512) NULL,
  post_type       VARCHAR(32)  NULL,
  likes_count     INT UNSIGNED NOT NULL DEFAULT 0,
  comments_count  INT UNSIGNED NOT NULL DEFAULT 0,
  posted_at       DATETIME     NULL,
  raw_json        LONGTEXT     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_post_id (post_id),
  KEY idx_username_posted_at (username, posted_at),
  KEY idx_posted_at (posted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS instagram_media (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id      VARCHAR(64)  NOT NULL,
  position     INT UNSIGNED NOT NULL DEFAULT 0,
  media_type   VARCHAR(16)  NOT NULL,
  media_url    VARCHAR(1024) NOT NULL,
  local_path   VARCHAR(1024) NULL,
  thumbnail_url VARCHAR(1024) NULL,
  width        INT UNSIGNED NULL,
  height       INT UNSIGNED NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_post_id (post_id),
  CONSTRAINT fk_media_post FOREIGN KEY (post_id) REFERENCES instagram_posts (post_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
