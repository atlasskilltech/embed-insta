const pool = require('../db/pool');

async function replaceForPost(postId, comments) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM instagram_comments WHERE post_id = :post_id', {
      post_id: postId,
    });

    for (const c of comments) {
      await conn.execute(
        `INSERT INTO instagram_comments
           (post_id, comment_id, owner_username, owner_id, text,
            likes_count, replies_count, parent_comment_id, posted_at)
         VALUES
           (:post_id, :comment_id, :owner_username, :owner_id, :text,
            :likes_count, :replies_count, :parent_comment_id, :posted_at)
         ON DUPLICATE KEY UPDATE
           owner_username = VALUES(owner_username),
           owner_id       = VALUES(owner_id),
           text           = VALUES(text),
           likes_count    = VALUES(likes_count),
           replies_count  = VALUES(replies_count),
           parent_comment_id = VALUES(parent_comment_id),
           posted_at      = VALUES(posted_at)`,
        {
          post_id: postId,
          comment_id: c.comment_id,
          owner_username: c.owner_username || null,
          owner_id: c.owner_id || null,
          text: c.text || null,
          likes_count: c.likes_count || 0,
          replies_count: c.replies_count || 0,
          parent_comment_id: c.parent_comment_id || null,
          posted_at: c.posted_at || null,
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
    `SELECT * FROM instagram_comments
     WHERE post_id = :post_id
     ORDER BY parent_comment_id IS NULL DESC, posted_at ASC, id ASC`,
    { post_id: postId }
  );
  return rows;
}

module.exports = { replaceForPost, findByPostId };
