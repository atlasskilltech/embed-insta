const { ingestFromGraph } = require('../services/ingestService');

(async () => {
  try {
    const summary = await ingestFromGraph();
    console.log('[runGraphOnce] done:', summary);
    process.exit(0);
  } catch (err) {
    console.error('[runGraphOnce] failed:', err);
    process.exit(1);
  }
})();
