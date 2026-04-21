require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const MIGRATIONS_TABLE = 'schema_migrations';

async function ensureDatabase({ host, port, user, password, database }) {
  const rootConn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
  });
  await rootConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await rootConn.end();
}

async function ensureMigrationsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
       filename   VARCHAR(255) NOT NULL,
       applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (filename)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function getApplied(conn) {
  const [rows] = await conn.query(
    `SELECT filename FROM ${MIGRATIONS_TABLE}`
  );
  return new Set(rows.map((r) => r.filename));
}

async function applyMigration(conn, filename) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
  if (sql.trim()) {
    await conn.query(sql);
  }
  await conn.execute(
    `INSERT INTO ${MIGRATIONS_TABLE} (filename) VALUES (:filename)`,
    { filename }
  );
}

async function migrate() {
  const {
    DB_HOST = '127.0.0.1',
    DB_PORT = '3306',
    DB_USER = 'root',
    DB_PASSWORD = '',
    DB_NAME = 'embed_insta',
  } = process.env;

  const dbConfig = {
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  };

  await ensureDatabase(dbConfig);

  const conn = await mysql.createConnection({
    ...dbConfig,
    multipleStatements: true,
    namedPlaceholders: true,
  });

  try {
    await ensureMigrationsTable(conn);

    // Run migrations first: they may rename legacy tables or add columns
    // on existing databases. Each file is idempotent and tolerates the
    // target table not existing yet (fresh installs will run them as
    // no-ops and schema.sql below will create tables with the new
    // columns already in place).
    const files = listMigrationFiles();
    const applied = await getApplied(conn);
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length) {
      for (const filename of pending) {
        console.log(`[migrate] applying ${filename}`);
        await applyMigration(conn, filename);
      }
    } else {
      console.log('[migrate] no pending migrations');
    }

    console.log('[migrate] applying schema.sql');
    const baseSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
    await conn.query(baseSql);

    console.log(`[migrate] database "${DB_NAME}" ready`);
  } finally {
    await conn.end();
  }
}

migrate().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
