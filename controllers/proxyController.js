const http = require('http');
const https = require('https');
const axios = require('axios');
const Media = require('../models/Media');
const Post = require('../models/Post');
const { downloader: referrerClient } = require('../services/mediaService');

const CACHE_OK = 'public, max-age=86400, stale-while-revalidate=604800';
const CACHE_ERR = 'public, max-age=300';
const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'etag', 'last-modified'];

// A dedicated HTTP client for preview proxying. The mediaService
// downloader sends Referer: https://www.instagram.com/ which works
// for the direct CDN scraping path but triggers 403 on some signed
// preview URLs — Instagram's CDN rejects spoofed referers from
// non-IG origins on the browser-image endpoint. We mimic a browser
// opening the URL in a fresh tab instead: no Referer, a current
// Chrome UA, and image-typed Sec-Fetch hints.
const previewClient = axios.create({
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false }),
  timeout: 30000,
  maxRedirects: 5,
  responseType: 'stream',
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept:
      'image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*;q=0.8,*/*;q=0.5',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
  },
  validateStatus: (s) => s >= 200 && s < 400,
});

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

function shortUrl(u) {
  return typeof u === 'string' ? u.slice(0, 140) + (u.length > 140 ? '…' : '') : '';
}

function drainError(err) {
  const stream = err && err.response && err.response.data;
  if (stream && typeof stream.resume === 'function') stream.resume();
}

async function fetchWithFallback(target) {
  try {
    return await previewClient.get(target);
  } catch (err) {
    drainError(err);
    const status = err && err.response && err.response.status;
    // Only retry through the IG-referer client when the fresh-tab
    // shape was rejected (403/401). Network errors won't be fixed by
    // a header swap, so bubble them.
    if (status === 401 || status === 403) {
      console.warn(
        '[proxy] bare fetch %s, retrying with IG referer: %s',
        status,
        shortUrl(target)
      );
      try {
        return await referrerClient.get(target);
      } catch (err2) {
        drainError(err2);
        throw err2;
      }
    }
    throw err;
  }
}

function streamUpstream(res, target) {
  return fetchWithFallback(target)
    .then((upstream) => {
      for (const name of PASSTHROUGH_HEADERS) {
        const v = upstream.headers && upstream.headers[name];
        if (v) res.setHeader(name, v);
      }
      res.setHeader('Cache-Control', CACHE_OK);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      upstream.data.on('error', (err) => {
        console.warn('[proxy] stream error:', err.message, shortUrl(target));
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
      const status = (err && err.response && err.response.status) || 502;
      console.warn(
        '[proxy] upstream fetch failed status=%s code=%s msg=%s url=%s',
        status,
        err && err.code,
        err && err.message,
        shortUrl(target)
      );
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
