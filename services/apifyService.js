const { ApifyClient } = require('apify-client');
const config = require('../config');

function getClient() {
  if (!config.apify.token) {
    throw new Error('APIFY_TOKEN is not configured');
  }
  return new ApifyClient({ token: config.apify.token });
}

function buildInput({ targets, resultsLimit, includeComments }) {
  const urls = (targets || []).filter(Boolean);
  if (urls.length === 0) {
    throw new Error('At least one Instagram URL target is required');
  }
  return {
    directUrls: urls,
    resultsType: 'posts',
    resultsLimit: resultsLimit ?? config.apify.resultsLimit,
    addParentData: false,
    searchType: 'user',
    searchLimit: 1,
    includeTaggedPosts: false,
    includeComments: includeComments ?? config.apify.includeComments,
  };
}

async function runScraper(options = {}) {
  const client = getClient();
  const input = buildInput({
    targets: options.targets || config.targets,
    resultsLimit: options.resultsLimit,
    includeComments: options.includeComments,
  });

  console.log(
    `[apify] starting actor ${config.apify.actorId} for ${input.directUrls.length} target(s)`
  );
  const run = await client.actor(config.apify.actorId).call(input, {
    waitSecs: 300,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`[apify] actor run ${run.id} returned ${items.length} item(s)`);

  return { runId: run.id, datasetId: run.defaultDatasetId, items };
}

module.exports = { runScraper, buildInput };
