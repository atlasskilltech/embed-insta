const { runScraper } = require('./apifyService');
const { normalizeBatch } = require('./normalizer');
const { downloadMedia } = require('./mediaService');
const Post = require('../models/Post');
const Media = require('../models/Media');

async function ingest(options = {}) {
  const { items } = await runScraper(options);
  const normalized = normalizeBatch(items);

  let savedPosts = 0;
  let savedMedia = 0;
  let downloadedMedia = 0;

  for (const { post, media } of normalized) {
    try {
      await Post.upsertPost(post);
      savedPosts += 1;

      const enriched = [];
      for (const m of media) {
        let local = null;
        if (options.downloadMedia !== false) {
          local = await downloadMedia({
            username: post.username,
            post_id: post.post_id,
            media_type: m.media_type,
            media_url: m.media_url,
            position: m.position,
          });
          if (local) downloadedMedia += 1;
        }
        enriched.push({
          ...m,
          local_path: local ? local.local_path : null,
        });
      }

      if (enriched.length) {
        await Media.replaceForPost(post.post_id, enriched);
        savedMedia += enriched.length;
      }
    } catch (err) {
      console.error(
        `[ingest] failed to save post ${post.post_id}: ${err.message}`
      );
    }
  }

  const summary = {
    fetched: items.length,
    normalized: normalized.length,
    savedPosts,
    savedMedia,
    downloadedMedia,
  };
  console.log('[ingest] summary:', summary);
  return summary;
}

module.exports = { ingest };
