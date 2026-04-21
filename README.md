# Embed Insta

Instagram Data Aggregation & Embed System built with **Node.js**, **Express**, **EJS**, **MySQL**, and **Apify**.

The system periodically scrapes public Instagram posts via the Apify Instagram Post Scraper, normalizes and stores them in MySQL, downloads media locally, exposes a REST API, and renders an embeddable iframe widget plus an Instagram-style feed UI.

## Features

- Apify integration to scrape public Instagram profiles / posts
- Normalization, de-duplication, and MySQL persistence
- Media downloader with per-post directory structure
- REST API: list posts, get post, trigger fetch, embed
- Embeddable iframe (`/embed/:postId`) for third-party usage
- EJS-rendered feed and post detail pages with responsive grid
- Optional scheduler via `node-cron`
- Optional API key auth for write endpoints

## Quick Start

```bash
cp .env.example .env
# edit .env with your DB credentials, APIFY_TOKEN, and INSTAGRAM_TARGETS
npm install
npm run migrate       # creates the database + tables
npm run create-admin  # interactive; or: --username=admin --password=... --force
npm start             # starts server on PORT (default 3000)
```

## Admin panel

Visit `/admin/login` to sign in. Once authenticated admins can:

- trigger Apify fetches (targets, limit, include comments, download media)
- manage the embeddable widget design (layout, columns, gap, radius, colors,
  font, toggles for username/caption/stats)
- preview the embed snippet and copy it

The widget styling is driven by the `widget_settings` table and applied to
both `/embed/:postId` and `/embed/feed` (a multi-post embeddable feed).

### Manually trigger a scrape

```bash
npm run fetch
# or
curl -X POST http://localhost:3000/api/instagram/fetch \
     -H "X-API-Key: $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"targets":["https://www.instagram.com/instagram/"],"resultsLimit":10}'
```

## API

| Method | Path                              | Description                         |
| ------ | --------------------------------- | ----------------------------------- |
| POST   | `/api/instagram/fetch`            | Trigger an Apify scrape run         |
| GET    | `/api/instagram/posts`            | Paginated list of stored posts      |
| GET    | `/api/instagram/post/:postId`     | Single post with media              |
| GET    | `/api/instagram/embed/:postId`    | JSON embed payload                  |
| GET    | `/embed/:postId`                  | HTML iframe-ready embed             |
| GET    | `/`                               | Feed page                           |
| GET    | `/post/:postId`                   | Post detail page                    |

## Database

Two kinds of SQL live under `db/`:

- `db/schema.sql` — the full current schema (idempotent, all `CREATE TABLE IF NOT EXISTS`). Running `npm run migrate` always ends by applying this file so fresh installs get the current shape.
- `db/migrations/NNN_description.sql` — versioned upgrade files applied once and tracked in the `schema_migrations` table. Run *before* `schema.sql` so they can rename legacy tables or add columns on existing databases before the baseline would no-op them.

Each migration file should be idempotent (guard `ALTER`/`RENAME` with an `information_schema` check so fresh installs and already-upgraded databases both succeed as no-ops). New upgrades: drop a numbered `.sql` file into `db/migrations/` and `npm run migrate`.

Two tables: `instagram_posts` and `instagram_media`. See `db/schema.sql`.

## Media storage

Files land in `MEDIA_DIR/{username}/{post_id}/` and are served from `/media/...`.

## Scheduler

Set `FETCH_CRON` in `.env` (e.g. `*/45 * * * *`). The server starts the cron job automatically unless the value is blank.
