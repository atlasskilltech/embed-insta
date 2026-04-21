const pool = require('../db/pool');

const COLUMNS = [
  'label',
  'ig_business_id',
  'fb_page_id',
  'access_token',
  'api_version',
  'results_limit',
  'include_comments',
  'is_active',
];

function normalizeRow(row) {
  if (!row) return null;
  return {
    ...row,
    is_active: Number(row.is_active) === 1,
    include_comments: Number(row.include_comments) === 1,
    results_limit: Number(row.results_limit) || 25,
  };
}

async function list() {
  const [rows] = await pool.query(
    'SELECT * FROM graph_accounts ORDER BY is_active DESC, label ASC, id ASC'
  );
  return rows.map(normalizeRow);
}

async function listActive() {
  const [rows] = await pool.query(
    'SELECT * FROM graph_accounts WHERE is_active = 1 ORDER BY label ASC, id ASC'
  );
  return rows.map(normalizeRow);
}

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT * FROM graph_accounts WHERE id = :id LIMIT 1',
    { id }
  );
  return normalizeRow(rows[0] || null);
}

function coerceInsert(patch) {
  const values = {};
  for (const col of COLUMNS) {
    if (patch[col] === undefined) continue;
    let v = patch[col];
    if (col === 'is_active' || col === 'include_comments') v = v ? 1 : 0;
    if (col === 'results_limit') v = Math.min(Math.max(parseInt(v, 10) || 25, 1), 200);
    if (col === 'api_version') v = String(v || 'v21.0').trim() || 'v21.0';
    if (col === 'label') v = String(v || '').trim();
    if (col === 'access_token') v = String(v || '').trim();
    if (col === 'ig_business_id' || col === 'fb_page_id') {
      v = v == null ? null : String(v).trim() || null;
    }
    values[col] = v;
  }
  return values;
}

async function create(patch) {
  const values = coerceInsert(patch);
  if (!values.label) throw new Error('Label is required');
  if (!values.ig_business_id) throw new Error('Instagram Business ID is required');
  if (!values.access_token) throw new Error('Access token is required');
  if (!values.api_version) values.api_version = 'v21.0';
  if (values.results_limit == null) values.results_limit = 25;
  if (values.is_active == null) values.is_active = 1;
  if (values.include_comments == null) values.include_comments = 0;
  const cols = Object.keys(values);
  const placeholders = cols.map((c) => `:${c}`).join(', ');
  const [result] = await pool.execute(
    `INSERT INTO graph_accounts (${cols.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return findById(result.insertId);
}

async function update(id, patch) {
  const values = coerceInsert(patch);
  if (!Object.keys(values).length) return findById(id);
  const sets = Object.keys(values).map((c) => `${c} = :${c}`);
  await pool.execute(
    `UPDATE graph_accounts SET ${sets.join(', ')} WHERE id = :id`,
    { ...values, id }
  );
  return findById(id);
}

async function remove(id) {
  await pool.execute('DELETE FROM graph_accounts WHERE id = :id', { id });
}

async function markFetched(id) {
  await pool.execute(
    'UPDATE graph_accounts SET last_fetched_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = :id',
    { id }
  );
}

async function markError(id, message) {
  await pool.execute(
    'UPDATE graph_accounts SET last_error = :message WHERE id = :id',
    { id, message: String(message || '').slice(0, 2000) }
  );
}

function maskToken(token) {
  if (!token) return '';
  const s = String(token);
  if (s.length <= 10) return '••••';
  return '••••' + s.slice(-6);
}

module.exports = {
  list,
  listActive,
  findById,
  create,
  update,
  remove,
  markFetched,
  markError,
  maskToken,
};
