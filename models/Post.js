const pool = require('../db/pool');

async function upsertPost(post) {
  const sql = `
    INSERT INTO instagram_posts
      (post_id, shortcode, username, owner_full_name, caption, permalink, post_type,
       likes_count, comments_count, posted_at, raw_json)
    VALUES
      (:post_id, :shortcode, :username, :owner_full_name, :caption, :permalink, :post_type,
       :likes_count, :comments_count, :posted_at, :raw_json)
    ON DUPLICATE KEY UPDATE
      shortcode = VALUES(shortcode),
      username = VALUES(username),
      owner_full_name = VALUES(owner_full_name),
      caption = VALUES(caption),
      permalink = VALUES(permalink),
      post_type = VALUES(post_type),
      likes_count = VALUES(likes_count),
      comments_count = VALUES(comments_count),
      posted_at = VALUES(posted_at),
      raw_json = VALUES(raw_json)
  `;
  await pool.execute(sql, post);
}

async function findByPostId(postId) {
  const [rows] = await pool.execute(
    'SELECT * FROM instagram_posts WHERE post_id = :post_id LIMIT 1',
    { post_id: postId }
  );
  return rows[0] || null;
}

async function listPosts({ page = 1, pageSize = 20, username = null } = {}) {
  const offset = (Math.max(1, page) - 1) * pageSize;
  const where = [];
  const params = {};
  if (username) {
    where.push('username = :username');
    params.username = username;
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

module.exports = { upsertPost, findByPostId, listPosts };
