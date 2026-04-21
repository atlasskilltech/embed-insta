const Media = require('../models/Media');
const Post = require('../models/Post');
const { downloader } = require('../services/mediaService');

const CACHE_OK = 'public, max-age=86400, stale-while-revalidate=604800';
const CACHE_ERR = 'public, max-age=300';
const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'etag', 'last-modified'];

async function resolveMediaTarget(postId, position, variant) {
  const rows = await Media.findByPostId(postId);
  if (!rows || !rows.length) return null;
  const pos = Number.isFinite(Number(position)) ? Number(position) : 0;
  const hit = rows.find((r) => Number(r.position) === pos) || rows[0];
  if (!hit) return null;
  if (variant === 'thumb') {
    if (hit.thumbnail_url) return hit.thumbnail_url;
    // Never stream video mp4 bytes into a consumer expecting a still
    // image — fall through to the post-level cover instead.
    if (hit.media_type === 'video') return null;
    return hit.media_url || null;
  }
  return hit.media_url || null;
}

async function resolveCoverTarget(postId) {
  const post = await Post.findByPostId(postId);
  if (!post) return null;
  if (post.display_url) return post.display_url;
  // Fall back to the first image media row if the post predates the
  // display_url column.
  const rows = await Media.findByPostId(postId);
  if (!rows || !rows.length) return null;
  const image = rows.find((r) => r.media_type === 'image' && (r.thumbnail_url || r.media_url));
  if (image) return image.thumbnail_url || image.media_url;
  const first = rows[0];
  return first && first.thumbnail_url ? first.thumbnail_url : null;
}

function streamUpstream(res, target) {
  return downloader
    .get(target)
    .then((upstream) => {
      for (const name of PASSTHROUGH_HEADERS) {
        const v = upstream.headers && upstream.headers[name];
        if (v) res.setHeader(name, v);
      }
      res.setHeader('Cache-Control', CACHE_OK);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      upstream.data.on('error', (err) => {
        console.warn('[proxy] stream error:', err.message);
        if (!res.headersSent) res.status(502);
        res.end();
      });
      res.on('close', () => {
        if (upstream.data && typeof upstream.data.destroy === 'function') {
          upstream.data.destroy();
        }
      });
      upstream.data.pipe(res);
    })
    .catch((err) => {
      const stream = err && err.response && err.response.data;
      if (stream && typeof stream.resume === 'function') stream.resume();
      const status = (err && err.response && err.response.status) || 502;
      res.set('Cache-Control', CACHE_ERR);
      res.status(status).end();
    });
}

async function mediaProxy(req, res) {
  const { postId, position } = req.params;
  const variant = req.params.variant === 'thumb' ? 'thumb' : 'primary';

  let target;
  try {
    target = await resolveMediaTarget(postId, position, variant);
    if (!target && variant === 'thumb') {
      // Video with no stored thumbnail: fall back to the post cover.
      target = await resolveCoverTarget(postId);
    }
  } catch (err) {
    console.error('[proxy] lookup failed:', err);
    res.set('Cache-Control', CACHE_ERR);
    return res.status(500).end();
  }
  if (!target) {
    res.set('Cache-Control', CACHE_ERR);
    return res.status(404).end();
  }
  await streamUpstream(res, target);
}

async function coverProxy(req, res) {
  const { postId } = req.params;
  let target;
  try {
    target = await resolveCoverTarget(postId);
  } catch (err) {
    console.error('[proxy] cover lookup failed:', err);
    res.set('Cache-Control', CACHE_ERR);
    return res.status(500).end();
  }
  if (!target) {
    res.set('Cache-Control', CACHE_ERR);
    return res.status(404).end();
  }
  await streamUpstream(res, target);
}

module.exports = { mediaProxy, coverProxy };
