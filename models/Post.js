const pool = require('../db/pool');

const POST_COLUMNS = [
  'post_id',
  'shortcode',
  'username',
  'owner_full_name',
  'owner_id',
  'caption',
  'alt_text',
  'display_url',
  'permalink',
  'input_url',
  'post_type',
  'product_type',
  'likes_count',
  'comments_count',
  'video_url',
  'video_view_count',
  'video_play_count',
  'video_duration',
  'dimensions_width',
  'dimensions_height',
  'location_name',
  'location_id',
  'music_song',
  'music_artist',
  'music_audio_id',
  'hashtags',
  'mentions',
  'tagged_users_json',
  'coauthors_json',
  'first_comment',
  'is_pinned',
  'is_comments_disabled',
  'posted_at',
  'raw_json',
];

async function upsertPost(post) {
  const placeholders = POST_COLUMNS.map((c) => `:${c}`).join(', ');
  const updates = POST_COLUMNS
    .filter((c) => c !== 'post_id')
    .map((c) => `${c} = VALUES(${c})`)
    .join(', ');

  const sql = `
    INSERT INTO instagram_posts (${POST_COLUMNS.join(', ')})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE ${updates}
  `;

  const params = {};
  for (const col of POST_COLUMNS) {
    params[col] = post[col] === undefined ? null : post[col];
  }
  await pool.execute(sql, params);
}

async function findByPostId(postId) {
  const [rows] = await pool.execute(
    'SELECT * FROM instagram_posts WHERE post_id = :post_id LIMIT 1',
    { post_id: postId }
  );
  return rows[0] || null;
}

async function listPosts({
  page = 1,
  pageSize = 20,
  username = null,
  usernames = null,
} = {}) {
  const offset = (Math.max(1, page) - 1) * pageSize;
  const where = [];
  const params = {};
  if (username) {
    where.push('username = :username');
    params.username = username;
  }
  if (Array.isArray(usernames) && usernames.length) {
    const lowered = usernames.map((u) => String(u).toLowerCase());
    const placeholders = lowered
      .map((_, i) => `:username_${i}`)
      .join(', ');
    lowered.forEach((value, i) => {
      params[`username_${i}`] = value;
    });
    where.push(`LOWER(username) IN (${placeholders})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT * FROM instagram_posts ${whereSql}
     ORDER BY posted_at DESC, id DESC
     LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`,
    params
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM instagram_posts ${whereSql}`,
    params
  );
  return { rows, total: countRows[0].total, page, pageSize };
}

module.exports = { upsertPost, findByPostId, listPosts, POST_COLUMNS };
