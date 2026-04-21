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
            media_url, local_path, local_thumbnail_path, thumbnail_url,
            alt_text, width, height)
         VALUES
           (:post_id, :position, :child_post_id, :child_shortcode, :media_type,
            :media_url, :local_path, :local_thumbnail_path, :thumbnail_url,
            :alt_text, :width, :height)`,
        {
          post_id: postId,
          position: m.position || 0,
          child_post_id: m.child_post_id || null,
          child_shortcode: m.child_shortcode || null,
          media_type: m.media_type,
          media_url: m.media_url,
          local_path: m.local_path || null,
          local_thumbnail_path: m.local_thumbnail_path || null,
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

async function findMissingLocal(limit = 100) {
  // Consider a media row "missing" if either the primary file or the
  // thumbnail is absent, so the redownload action can fill in whichever
  // side is missing without re-ingesting the whole post.
  const [rows] = await pool.query(
    `SELECT m.id, m.post_id, m.position, m.media_type, m.media_url,
            m.thumbnail_url, m.local_path, m.local_thumbnail_path,
            p.username
       FROM instagram_media m
       JOIN instagram_posts p ON p.post_id = m.post_id
      WHERE m.local_path IS NULL
         OR (m.thumbnail_url IS NOT NULL AND m.local_thumbnail_path IS NULL)
      ORDER BY m.id ASC
      LIMIT ${Number(limit) || 100}`
  );
  return rows;
}

async function findBadVideoMirrors() {
  const [rows] = await pool.query(
    `SELECT id, local_path FROM instagram_media
      WHERE media_type = 'video'
        AND local_path IS NOT NULL
        AND local_path NOT LIKE '%.mp4'
        AND local_path NOT LIKE '%.webm'
        AND local_path NOT LIKE '%.mov'`
  );
  return rows;
}

async function clearLocalPath(id) {
  await pool.execute(
    'UPDATE instagram_media SET local_path = NULL WHERE id = :id',
    { id }
  );
}

async function setLocalPaths(id, { local_path, local_thumbnail_path }) {
  const sets = [];
  const params = { id };
  if (local_path !== undefined) {
    sets.push('local_path = :local_path');
    params.local_path = local_path;
  }
  if (local_thumbnail_path !== undefined) {
    sets.push('local_thumbnail_path = :local_thumbnail_path');
    params.local_thumbnail_path = local_thumbnail_path;
  }
  if (!sets.length) return;
  await pool.execute(
    `UPDATE instagram_media SET ${sets.join(', ')} WHERE id = :id`,
    params
  );
}

module.exports = {
  replaceForPost,
  findByPostId,
  findByPostIds,
  findMissingLocal,
  findBadVideoMirrors,
  clearLocalPath,
  setLocalPaths,
};
