#!/usr/bin/env node
const readline = require('readline');
const AdminUser = require('../models/AdminUser');
const pool = require('../db/pool');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [key, inlineValue] = a.slice(2).split('=');
    if (inlineValue !== undefined) {
      out[key] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[key] = argv[++i];
    } else {
      out[key] = true;
    }
  }
  return out;
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function run() {
  const args = parseArgs(process.argv);

  const username = (args.username || (await ask('Username: '))).trim();
  if (!username) throw new Error('username is required');

  const existing = await AdminUser.findByUsername(username);
  if (existing && !args.force) {
    console.error(
      `[create-admin] user "${username}" already exists. Use --force to reset password.`
    );
    process.exit(1);
  }

  const email =
    (args.email !== undefined
      ? String(args.email)
      : await ask('Email (optional): ')
    ).trim() || null;
  const displayName =
    (args.name !== undefined
      ? String(args.name)
      : await ask('Display name (optional): ')
    ).trim() || null;
  const password = args.password
    ? String(args.password)
    : await ask('Password (min 8 chars): ');

  if (!password || password.length < 8) {
    throw new Error('password must be at least 8 characters');
  }

  if (existing && args.force) {
    await AdminUser.updatePassword(existing.id, password);
    console.log(`[create-admin] password updated for "${username}"`);
  } else {
    const id = await AdminUser.create({ username, email, password, displayName });
    console.log(`[create-admin] created admin "${username}" (id=${id})`);
  }
}

run()
  .catch((err) => {
    console.error('[create-admin] failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
