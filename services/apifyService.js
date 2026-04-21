const { ApifyClient } = require('apify-client');
const config = require('../config');

function getClient() {
  if (!config.apify.token) {
    throw new Error('APIFY_TOKEN is not configured');
  }
  return new ApifyClient({ token: config.apify.token });
}

const PROFILE_URL_RE = /^https?:\/\/(?:www\.)?instagram\.com\/([^/?#]+)/i;
const POST_PATH_RE = /\/(?:p|reel|reels|tv)\//i;

function extractUsername(target) {
  if (!target) return null;
  const trimmed = String(target).trim();
  if (!trimmed) return null;
  if (!trimmed.includes('/')) {
    return trimmed.replace(/^@/, '').toLowerCase() || null;
  }
  if (POST_PATH_RE.test(trimmed)) return null;
  const match = trimmed.match(PROFILE_URL_RE);
  if (!match) return null;
  return match[1].toLowerCase();
}

function buildInput({ targets, resultsLimit, includeComments }) {
  const list = (targets || []).map((t) => String(t).trim()).filter(Boolean);
  if (list.length === 0) {
    throw new Error('At least one Instagram target is required');
  }

  const usernames = new Set();
  const directUrls = [];
  for (const t of list) {
    const username = extractUsername(t);
    if (username) {
      usernames.add(username);
      continue;
    }
    if (t.includes('/')) directUrls.push(t);
  }

  if (usernames.size === 0 && directUrls.length === 0) {
    throw new Error('No valid Instagram usernames or URLs found in targets');
  }

  const input = {
    resultsType: 'posts',
    resultsLimit: resultsLimit ?? config.apify.resultsLimit,
    addParentData: false,
    searchType: 'user',
    searchLimit: 1,
    includeTaggedPosts: false,
    includeComments: includeComments ?? config.apify.includeComments,
  };

  if (usernames.size > 0) input.username = [...usernames];
  if (directUrls.length > 0) input.directUrls = directUrls;

  return input;
}

async function runScraper(options = {}) {
  const client = getClient();
  const input = buildInput({
    targets: options.targets || config.targets,
    resultsLimit: options.resultsLimit,
    includeComments: options.includeComments,
  });

  const targetCount =
    (input.username ? input.username.length : 0) +
    (input.directUrls ? input.directUrls.length : 0);
  console.log(
    `[apify] starting actor ${config.apify.actorId} for ${targetCount} target(s)` +
      (input.username ? ` users=[${input.username.join(',')}]` : '') +
      (input.directUrls ? ` urls=${input.directUrls.length}` : '')
  );
  const run = await client.actor(config.apify.actorId).call(input, {
    waitSecs: 300,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`[apify] actor run ${run.id} returned ${items.length} item(s)`);

  return { runId: run.id, datasetId: run.defaultDatasetId, items };
}

module.exports = { runScraper, buildInput };
