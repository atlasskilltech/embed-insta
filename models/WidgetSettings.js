const pool = require('../db/pool');

const DEFAULTS = {
  name: 'default',
  layout: 'grid',
  columns: 3,
  card_radius: 8,
  gap: 12,
  show_caption: 1,
  show_stats: 1,
  show_username: 1,
  accent_color: '#0095f6',
  background: '#ffffff',
  text_color: '#262626',
  border_color: '#dbdbdb',
  font_family: 'system-ui',
  max_items: 9,
};

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const ALLOWED_LAYOUTS = new Set(['grid', 'list', 'carousel']);

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  return HEX_RE.test(value.trim()) ? value.trim() : fallback;
}

function sanitizeFont(value) {
  if (typeof value !== 'string') return DEFAULTS.font_family;
  const v = value.trim().slice(0, 128);
  return v || DEFAULTS.font_family;
}

function sanitize(input = {}) {
  return {
    layout: ALLOWED_LAYOUTS.has(input.layout) ? input.layout : DEFAULTS.layout,
    columns: clampInt(input.columns, 1, 6, DEFAULTS.columns),
    card_radius: clampInt(input.card_radius, 0, 40, DEFAULTS.card_radius),
    gap: clampInt(input.gap, 0, 48, DEFAULTS.gap),
    show_caption: input.show_caption ? 1 : 0,
    show_stats: input.show_stats ? 1 : 0,
    show_username: input.show_username ? 1 : 0,
    accent_color: sanitizeColor(input.accent_color, DEFAULTS.accent_color),
    background: sanitizeColor(input.background, DEFAULTS.background),
    text_color: sanitizeColor(input.text_color, DEFAULTS.text_color),
    border_color: sanitizeColor(input.border_color, DEFAULTS.border_color),
    font_family: sanitizeFont(input.font_family),
    max_items: clampInt(input.max_items, 1, 60, DEFAULTS.max_items),
  };
}

async function getActive() {
  const [rows] = await pool.query(
    "SELECT * FROM widget_settings WHERE name = 'default' LIMIT 1"
  );
  if (rows[0]) return rows[0];
  await pool.execute(
    "INSERT IGNORE INTO widget_settings (name) VALUES ('default')"
  );
  const [retry] = await pool.query(
    "SELECT * FROM widget_settings WHERE name = 'default' LIMIT 1"
  );
  return retry[0] || { ...DEFAULTS };
}

async function update(patch, userId = null) {
  const clean = sanitize(patch);
  await pool.execute(
    `UPDATE widget_settings
       SET layout = :layout,
           columns = :columns,
           card_radius = :card_radius,
           gap = :gap,
           show_caption = :show_caption,
           show_stats = :show_stats,
           show_username = :show_username,
           accent_color = :accent_color,
           background = :background,
           text_color = :text_color,
           border_color = :border_color,
           font_family = :font_family,
           max_items = :max_items,
           updated_by = :updated_by
     WHERE name = 'default'`,
    { ...clean, updated_by: userId }
  );
  return getActive();
}

module.exports = { DEFAULTS, getActive, update, sanitize };
