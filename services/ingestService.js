const { runScraper } = require('./apifyService');
const graphApi = require('./graphApiService');
const { normalizeBatch, normalizeGraphBatch } = require('./normalizer');
const { downloadMedia } = require('./mediaService');
const Post = require('../models/Post');
const Media = require('../models/Media');
const Comment = require('../models/Comment');
const GraphAccount = require('../models/GraphAccount');

function emptySummary(extra = {}) {
  return {
    fetched: 0,
    normalized: 0,
    savedPosts: 0,
    savedMedia: 0,
    downloadedMedia: 0,
    savedComments: 0,
    ...extra,
  };
}

async function saveNormalized(normalized, options = {}) {
  const summary = emptySummary({
    fetched: options.fetched != null ? options.fetched : normalized.length,
    normalized: normalized.length,
  });
  const downloadEnabled = options.downloadMedia !== false;

  for (const { post, media, comments } of normalized) {
    try {
      await Post.upsertPost(post);
      summary.savedPosts += 1;

      const enriched = [];
      for (const m of media) {
        let local = null;
        if (downloadEnabled) {
          local = await downloadMedia({
            username: post.username,
            post_id: post.post_id,
            media_type: m.media_type,
            media_url: m.media_url,
            thumbnail_url: m.thumbnail_url,
            position: m.position,
          });
          if (local) summary.downloadedMedia += 1;
        }
        enriched.push({
          ...m,
          local_path: local ? local.local_path : null,
          local_thumbnail_path: local ? local.local_thumbnail_path : null,
        });
      }

      if (enriched.length) {
        await Media.replaceForPost(post.post_id, enriched);
        summary.savedMedia += enriched.length;
      }

      if (Array.isArray(comments) && comments.length) {
        await Comment.replaceForPost(post.post_id, comments);
        summary.savedComments += comments.length;
      }
    } catch (err) {
      console.error(
        `[ingest] failed to save post ${post.post_id}: ${err.message}`
      );
    }
  }

  return summary;
}

async function ingest(options = {}) {
  const { items } = await runScraper(options);
  const normalized = normalizeBatch(items);
  const summary = await saveNormalized(normalized, {
    ...options,
    fetched: items.length,
  });
  summary.source = 'apify';
  console.log('[ingest] summary:', summary);
  return summary;
}

async function ingestGraphAccount(account, options = {}) {
  const { items } = await graphApi.fetchMedia(account, options);
  // Optional: pull comments for each post whose account is configured
  // to include them.
  if (account.include_comments) {
    for (const item of items) {
      try {
        item._comments = await graphApi.fetchComments(account, item.id, {
          limit: 20,
        });
      } catch (_) {
        item._comments = [];
      }
    }
  }
  const normalized = normalizeGraphBatch(items);
  const summary = await saveNormalized(normalized, {
    ...options,
    fetched: items.length,
  });
  summary.source = 'graph';
  summary.account = { id: account.id, label: account.label, ig_business_id: account.ig_business_id };
  return summary;
}

async function ingestFromGraph(options = {}) {
  const accounts = Array.isArray(options.accounts) && options.accounts.length
    ? options.accounts
    : await GraphAccount.listActive();

  const totals = emptySummary();
  const perAccount = [];

  for (const account of accounts) {
    try {
      const s = await ingestGraphAccount(account, options);
      perAccount.push(s);
      for (const key of Object.keys(totals)) {
        if (typeof totals[key] === 'number' && typeof s[key] === 'number') {
          totals[key] += s[key];
        }
      }
      await GraphAccount.markFetched(account.id);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.error(
        `[ingest] graph account "${account.label || account.ig_business_id}" failed: ${message}`
      );
      await GraphAccount.markError(account.id, message);
      perAccount.push({
        source: 'graph',
        account: { id: account.id, label: account.label },
        error: message,
      });
    }
  }

  const summary = {
    ...totals,
    source: 'graph',
    accounts: perAccount,
  };
  console.log('[ingest] graph summary:', summary);
  return summary;
}

module.exports = {
  ingest,
  ingestFromGraph,
  ingestGraphAccount,
  saveNormalized,
};
