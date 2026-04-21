require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function migrate() {
  const {
    DB_HOST = '127.0.0.1',
    DB_PORT = '3306',
    DB_USER = 'root',
    DB_PASSWORD = '',
    DB_NAME = 'embed_insta',
  } = process.env;

  const rootConn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  await rootConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await rootConn.end();

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
  });

  const [renameRows] = await conn.query(
    `SELECT
       SUM(CASE WHEN table_name = 'admin_users' THEN 1 ELSE 0 END) AS old_exists,
       SUM(CASE WHEN table_name = 'embed_users' THEN 1 ELSE 0 END) AS new_exists
     FROM information_schema.tables
     WHERE table_schema = ?`,
    [DB_NAME]
  );
  const { old_exists, new_exists } = renameRows[0] || {};
  if (Number(old_exists) && !Number(new_exists)) {
    console.log('[migrate] renaming admin_users -> embed_users');
    await conn.query('RENAME TABLE admin_users TO embed_users');
  }

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(sql);

  async function ensureColumn(table, column, definition) {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS c FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
      [DB_NAME, table, column]
    );
    if (!Number(rows[0].c)) {
      console.log(`[migrate] adding ${table}.${column}`);
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    }
  }

  await ensureColumn('widget_settings', 'title', 'title VARCHAR(128) NULL AFTER name');
  await ensureColumn('widget_settings', 'targets_json', 'targets_json TEXT NULL AFTER title');

  await conn.end();

  console.log(`[migrate] database "${DB_NAME}" ready`);
}

migrate().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
