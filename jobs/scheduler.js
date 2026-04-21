const cron = require('node-cron');
const config = require('../config');
const { ingest } = require('../services/ingestService');

let running = false;

async function runOnce(label) {
  if (running) {
    console.log(`[scheduler] ${label}: previous run still in progress; skipping`);
    return;
  }
  running = true;
  try {
    console.log(`[scheduler] ${label}: ingest started`);
    const summary = await ingest();
    console.log(`[scheduler] ${label}: ingest done`, summary);
  } catch (err) {
    console.error(`[scheduler] ${label}: ingest failed:`, err.message);
  } finally {
    running = false;
  }
}

function start() {
  const hasApify = Boolean(config.apify.token);
  const hasTargets = config.targets.length > 0;

  if (config.fetchOnStart) {
    if (!hasApify) {
      console.warn('[scheduler] FETCH_ON_START set but APIFY_TOKEN missing; skipping initial run');
    } else if (!hasTargets) {
      console.warn('[scheduler] FETCH_ON_START set but INSTAGRAM_TARGETS empty; skipping initial run');
    } else {
      console.log('[scheduler] FETCH_ON_START enabled; running ingest once at startup');
      setImmediate(() => runOnce('startup'));
    }
  }

  if (!config.fetchCron) {
    console.log('[scheduler] FETCH_CRON is blank; cron disabled');
    return null;
  }
  if (!cron.validate(config.fetchCron)) {
    console.warn(`[scheduler] invalid cron expression: ${config.fetchCron}`);
    return null;
  }
  if (!hasApify) {
    console.warn('[scheduler] APIFY_TOKEN missing; cron disabled');
    return null;
  }
  if (!hasTargets) {
    console.warn('[scheduler] INSTAGRAM_TARGETS empty; cron disabled');
    return null;
  }

  console.log(`[scheduler] starting with cron "${config.fetchCron}"`);
  return cron.schedule(config.fetchCron, () => runOnce('cron'));
}

module.exports = { start, runOnce };
