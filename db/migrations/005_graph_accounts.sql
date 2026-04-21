-- Meta Graph API credentials per Instagram Business Account. Each row
-- is an ingestion source: the scheduler and admin "Fetch now" action
-- loop over every active row. Keeping creds in MySQL (vs env vars)
-- lets us rotate tokens and support multiple IG accounts from the
-- admin UI without redeploying.

CREATE TABLE IF NOT EXISTS graph_accounts (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  label             VARCHAR(128)      NOT NULL,
  ig_business_id    VARCHAR(64)       NOT NULL,
  fb_page_id        VARCHAR(64)       NULL,
  access_token      TEXT              NOT NULL,
  api_version       VARCHAR(16)       NOT NULL DEFAULT 'v21.0',
  results_limit     SMALLINT UNSIGNED NOT NULL DEFAULT 25,
  include_comments  TINYINT(1)        NOT NULL DEFAULT 0,
  is_active         TINYINT(1)        NOT NULL DEFAULT 1,
  last_fetched_at   DATETIME          NULL,
  last_error        TEXT              NULL,
  created_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_graph_ig_business (ig_business_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
