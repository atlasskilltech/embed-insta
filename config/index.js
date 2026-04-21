require('dotenv').config();
const path = require('path');

const toBool = (v, def = false) => {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

const toInt = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};

const toList = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const mediaDir = process.env.MEDIA_DIR || 'uploads/instagram';

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 3000),
  baseUrl: process.env.BASE_URL || `http://localhost:${toInt(process.env.PORT, 3000)}`,
  apiKey: process.env.API_KEY || '',

  admin: {
    sessionSecret: process.env.ADMIN_SESSION_SECRET || 'change-me-in-production',
    sessionMaxAgeMs: toInt(process.env.ADMIN_SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 8),
    cookieSecure: toBool(process.env.ADMIN_COOKIE_SECURE, false),
  },

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'embed_insta',
  },

  apify: {
    token: process.env.APIFY_TOKEN || '',
    actorId: process.env.APIFY_ACTOR_ID || 'apify/instagram-post-scraper',
    resultsLimit: toInt(process.env.APIFY_RESULTS_LIMIT, 20),
    includeComments: toBool(process.env.APIFY_INCLUDE_COMMENTS, false),
  },

  targets: toList(process.env.INSTAGRAM_TARGETS),

  fetchCron: process.env.FETCH_CRON || '',
  fetchOnStart: toBool(process.env.FETCH_ON_START, false),

  media: {
    dir: mediaDir,
    absDir: path.resolve(process.cwd(), mediaDir),
    urlPrefix: '/media',
  },
};
