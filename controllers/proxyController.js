const Media = require('../models/Media');
const { downloader } = require('../services/mediaService');

const CACHE_OK = 'public, max-age=86400, stale-while-revalidate=604800';
const CACHE_ERR = 'public, max-age=300';
const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'etag', 'last-modified'];

async function resolveTarget(postId, position, variant) {
  const rows = await Media.findByPostId(postId);
  if (!rows || !rows.length) return null;
  const pos = Number.isFinite(Number(position)) ? Number(position) : 0;
  const hit = rows.find((r) => Number(r.position) === pos) || rows[0];
  if (!hit) return null;
  const url = variant === 'thumb' ? hit.thumbnail_url || hit.media_url : hit.media_url;
  return url || null;
}

async function mediaProxy(req, res) {
  const { postId, position } = req.params;
  const variant = req.params.variant === 'thumb' ? 'thumb' : 'primary';

  let target;
  try {
    target = await resolveTarget(postId, position, variant);
  } catch (err) {
    console.error('[proxy] lookup failed:', err);
    res.set('Cache-Control', CACHE_ERR);
    return res.status(500).end();
  }
  if (!target) {
    res.set('Cache-Control', CACHE_ERR);
    return res.status(404).end();
  }

  let upstream;
  try {
    upstream = await downloader.get(target);
  } catch (err) {
    const stream = err && err.response && err.response.data;
    if (stream && typeof stream.resume === 'function') stream.resume();
    const status = (err && err.response && err.response.status) || 502;
    res.set('Cache-Control', CACHE_ERR);
    return res.status(status).end();
  }

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
  req.on('close', () => {
    if (upstream.data && typeof upstream.data.destroy === 'function') {
      upstream.data.destroy();
    }
  });

  upstream.data.pipe(res);
}

module.exports = { mediaProxy };
