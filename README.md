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
npm start             # starts server on PORT (default 3000)
```

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

Two tables: `instagram_posts` and `instagram_media`. See `db/schema.sql`.

## Media storage

Files land in `MEDIA_DIR/{username}/{post_id}/` and are served from `/media/...`.

## Scheduler

Set `FETCH_CRON` in `.env` (e.g. `*/45 * * * *`). The server starts the cron job automatically unless the value is blank.
