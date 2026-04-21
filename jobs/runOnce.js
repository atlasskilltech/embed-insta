const { ingest } = require('../services/ingestService');

(async () => {
  try {
    const summary = await ingest();
    console.log('[runOnce] done:', summary);
    process.exit(0);
  } catch (err) {
    console.error('[runOnce] failed:', err);
    process.exit(1);
  }
})();
