const cron = require('node-cron');
const config = require('../config');
const { ingest } = require('../services/ingestService');

let running = false;

function start() {
  if (!config.fetchCron) {
    console.log('[scheduler] FETCH_CRON is blank; scheduler disabled');
    return null;
  }
  if (!cron.validate(config.fetchCron)) {
    console.warn(`[scheduler] invalid cron expression: ${config.fetchCron}`);
    return null;
  }
  if (!config.apify.token) {
    console.warn('[scheduler] APIFY_TOKEN missing; scheduler disabled');
    return null;
  }
  if (!config.targets.length) {
    console.warn('[scheduler] INSTAGRAM_TARGETS empty; scheduler disabled');
    return null;
  }

  console.log(`[scheduler] starting with cron "${config.fetchCron}"`);
  return cron.schedule(config.fetchCron, async () => {
    if (running) {
      console.log('[scheduler] previous run still in progress; skipping');
      return;
    }
    running = true;
    try {
      await ingest();
    } catch (err) {
      console.error('[scheduler] ingest failed:', err.message);
    } finally {
      running = false;
    }
  });
}

module.exports = { start };
