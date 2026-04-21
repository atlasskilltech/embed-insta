const pool = require('../db/pool');

const DEFAULTS = {
  name: 'default',
  title: 'Default widget',
  targets_json: null,
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
const LAYOUTS = [
  { value: 'grid', label: 'Grid', description: 'Clean, balanced layout perfect for Instagram portfolios.' },
  { value: 'masonry', label: 'Masonry', description: 'Staggered heights that work well for mixed media types.' },
  { value: 'carousel', label: 'Carousel', description: 'Horizontal swipeable strip of cards.' },
  { value: 'slider', label: 'Slider', description: 'Single-item slider with navigation arrows.' },
  { value: 'social-wall', label: 'Social Wall', description: 'High-energy collage style for events and campaigns.' },
  { value: 'single', label: 'Single Post', description: 'Highlights one featured post or announcement.' },
  { value: 'list', label: 'List', description: 'Stacked full-width cards for reading feeds.' },
];
const ALLOWED_LAYOUTS = new Set(LAYOUTS.map((l) => l.value));
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

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

function sanitizeSlug(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!SLUG_RE.test(v)) return null;
  return v;
}

function parseTargets(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractUsernameFromTarget(t) {
  if (!t) return null;
  const trimmed = String(t).trim();
  if (!trimmed) return null;
  if (!trimmed.includes('/')) return trimmed.replace(/^@/, '').toLowerCase() || null;
  if (/\/(?:p|reel|reels|tv)\//i.test(trimmed)) return null;
  const m = trimmed.match(/^https?:\/\/(?:www\.)?instagram\.com\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function usernamesFromRow(row) {
  if (!row || !row.targets_json) return [];
  try {
    const parsed = JSON.parse(row.targets_json);
    return parseTargets(parsed).map(extractUsernameFromTarget).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function sanitize(input = {}) {
  return {
    title: (input.title && String(input.title).trim().slice(0, 128)) || null,
    targets_json: JSON.stringify(parseTargets(input.targets)),
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

async function ensureDefault() {
  await pool.execute(
    "INSERT IGNORE INTO widget_settings (name, title) VALUES ('default', 'Default widget')"
  );
}

async function list() {
  await ensureDefault();
  const [rows] = await pool.query(
    'SELECT * FROM widget_settings ORDER BY name = "default" DESC, updated_at DESC'
  );
  return rows;
}

async function findBySlug(slug) {
  const name = slug === 'default' ? 'default' : sanitizeSlug(slug);
  if (!name) return null;
  const [rows] = await pool.execute(
    'SELECT * FROM widget_settings WHERE name = :name LIMIT 1',
    { name }
  );
  return rows[0] || null;
}

async function getActive(slug = 'default') {
  const row = await findBySlug(slug);
  if (row) return row;
  if (slug === 'default') {
    await ensureDefault();
    return findBySlug('default');
  }
  return null;
}

async function create({ slug, title, targets, ...rest }, userId = null) {
  const name = sanitizeSlug(slug);
  if (!name) throw new Error('slug must be 1-64 chars of a-z, 0-9, or -');
  const existing = await findBySlug(name);
  if (existing) throw new Error(`widget "${name}" already exists`);
  const clean = sanitize({ ...rest, title, targets });
  await pool.execute(
    `INSERT INTO widget_settings (
       name, title, targets_json, layout, columns, card_radius, gap,
       show_caption, show_stats, show_username,
       accent_color, background, text_color, border_color, font_family,
       max_items, updated_by
     ) VALUES (
       :name, :title, :targets_json, :layout, :columns, :card_radius, :gap,
       :show_caption, :show_stats, :show_username,
       :accent_color, :background, :text_color, :border_color, :font_family,
       :max_items, :updated_by
     )`,
    { name, ...clean, updated_by: userId }
  );
  return findBySlug(name);
}

async function update(slug, patch, userId = null) {
  const name = slug === 'default' ? 'default' : sanitizeSlug(slug);
  if (!name) throw new Error('invalid slug');
  const clean = sanitize(patch);
  await pool.execute(
    `UPDATE widget_settings
       SET title = :title,
           targets_json = :targets_json,
           layout = :layout,
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
     WHERE name = :name`,
    { name, ...clean, updated_by: userId }
  );
  return findBySlug(name);
}

async function remove(slug) {
  if (slug === 'default') throw new Error('cannot delete the default widget');
  const name = sanitizeSlug(slug);
  if (!name) throw new Error('invalid slug');
  const [result] = await pool.execute(
    'DELETE FROM widget_settings WHERE name = :name',
    { name }
  );
  return result.affectedRows > 0;
}

function targetsToDisplay(row) {
  if (!row || !row.targets_json) return [];
  try { return parseTargets(JSON.parse(row.targets_json)); } catch (_) { return []; }
}

module.exports = {
  DEFAULTS,
  LAYOUTS,
  list,
  findBySlug,
  getActive,
  create,
  update,
  remove,
  sanitize,
  sanitizeSlug,
  usernamesFromRow,
  targetsToDisplay,
};
