const pool = require('../db/pool');

async function replaceForPost(postId, mediaItems) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM instagram_media WHERE post_id = :post_id', {
      post_id: postId,
    });

    for (const m of mediaItems) {
      await conn.execute(
        `INSERT INTO instagram_media
           (post_id, position, child_post_id, child_shortcode, media_type,
            media_url, local_path, thumbnail_url, alt_text, width, height)
         VALUES
           (:post_id, :position, :child_post_id, :child_shortcode, :media_type,
            :media_url, :local_path, :thumbnail_url, :alt_text, :width, :height)`,
        {
          post_id: postId,
          position: m.position || 0,
          child_post_id: m.child_post_id || null,
          child_shortcode: m.child_shortcode || null,
          media_type: m.media_type,
          media_url: m.media_url,
          local_path: m.local_path || null,
          thumbnail_url: m.thumbnail_url || null,
          alt_text: m.alt_text || null,
          width: m.width || null,
          height: m.height || null,
        }
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function findByPostId(postId) {
  const [rows] = await pool.execute(
    `SELECT * FROM instagram_media WHERE post_id = :post_id ORDER BY position ASC, id ASC`,
    { post_id: postId }
  );
  return rows;
}

async function findByPostIds(postIds) {
  if (!postIds.length) return {};
  const placeholders = postIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT * FROM instagram_media WHERE post_id IN (${placeholders}) ORDER BY position ASC, id ASC`,
    postIds
  );
  const grouped = {};
  for (const r of rows) {
    (grouped[r.post_id] = grouped[r.post_id] || []).push(r);
  }
  return grouped;
}

module.exports = { replaceForPost, findByPostId, findByPostIds };
