const cron = require('node-cron');
const config = require('../config');
const { ingest, ingestFromGraph } = require('../services/ingestService');
const GraphAccount = require('../models/GraphAccount');

let running = false;

async function runApify(label) {
  const hasApify = Boolean(config.apify.token);
  const hasTargets = config.targets.length > 0;
  if (!hasApify || !hasTargets) return null;
  try {
    console.log(`[scheduler] ${label}: apify ingest started`);
    const summary = await ingest();
    console.log(`[scheduler] ${label}: apify ingest done`, summary);
    return summary;
  } catch (err) {
    console.error(`[scheduler] ${label}: apify ingest failed:`, err.message);
    return null;
  }
}

async function runGraph(label) {
  let accounts = [];
  try {
    accounts = await GraphAccount.listActive();
  } catch (err) {
    console.warn(
      `[scheduler] ${label}: could not list graph accounts (` +
        `${err.message}); skipping graph ingest`
    );
    return null;
  }
  if (!accounts.length) return null;
  try {
    console.log(
      `[scheduler] ${label}: graph ingest started (${accounts.length} account(s))`
    );
    const summary = await ingestFromGraph({ accounts });
    console.log(`[scheduler] ${label}: graph ingest done`, summary);
    return summary;
  } catch (err) {
    console.error(`[scheduler] ${label}: graph ingest failed:`, err.message);
    return null;
  }
}

async function runOnce(label) {
  if (running) {
    console.log(`[scheduler] ${label}: previous run still in progress; skipping`);
    return;
  }
  running = true;
  try {
    // Graph first because it's the official API path; Apify runs after
    // so a Graph token hiccup doesn't starve Apify-only targets.
    await runGraph(label);
    await runApify(label);
  } finally {
    running = false;
  }
}

function start() {
  if (config.fetchOnStart) {
    console.log('[scheduler] FETCH_ON_START enabled; running ingest once at startup');
    setImmediate(() => runOnce('startup'));
  }

  if (!config.fetchCron) {
    console.log('[scheduler] FETCH_CRON is blank; cron disabled');
    return null;
  }
  if (!cron.validate(config.fetchCron)) {
    console.warn(`[scheduler] invalid cron expression: ${config.fetchCron}`);
    return null;
  }

  console.log(`[scheduler] starting with cron "${config.fetchCron}"`);
  return cron.schedule(config.fetchCron, () => runOnce('cron'));
}

module.exports = { start, runOnce };
