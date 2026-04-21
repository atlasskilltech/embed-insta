const pool = require('../db/pool');
const bcrypt = require('bcryptjs');

async function findByUsername(username) {
  const [rows] = await pool.execute(
    'SELECT * FROM embed_users WHERE username = :username LIMIT 1',
    { username }
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT * FROM embed_users WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

async function countActive() {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM embed_users WHERE is_active = 1'
  );
  return rows[0].total;
}

async function create({ username, email, password, displayName }) {
  const password_hash = await bcrypt.hash(password, 10);
  const [result] = await pool.execute(
    `INSERT INTO embed_users (username, email, password_hash, display_name)
     VALUES (:username, :email, :password_hash, :display_name)`,
    {
      username,
      email: email || null,
      password_hash,
      display_name: displayName || null,
    }
  );
  return result.insertId;
}

async function updatePassword(id, password) {
  const password_hash = await bcrypt.hash(password, 10);
  await pool.execute(
    'UPDATE embed_users SET password_hash = :password_hash WHERE id = :id',
    { id, password_hash }
  );
}

async function touchLogin(id) {
  await pool.execute(
    'UPDATE embed_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id',
    { id }
  );
}

async function verifyPassword(user, password) {
  if (!user || !user.password_hash) return false;
  return bcrypt.compare(password, user.password_hash);
}

module.exports = {
  findByUsername,
  findById,
  countActive,
  create,
  updatePassword,
  touchLogin,
  verifyPassword,
};
