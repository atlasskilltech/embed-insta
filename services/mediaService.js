const fs = require('fs');
const fsp = fs.promises;
const { pipeline } = require('stream/promises');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');
const config = require('../config');

// Fresh agents with keepAlive off so a failed download can't leak error
// listeners onto a reused TLS socket (the source of the recurring
// MaxListenersExceededWarning on long fetches).
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

const downloader = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 60000,
  maxRedirects: 5,
  responseType: 'stream',
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    Accept: 'image/*,video/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.instagram.com/',
  },
  validateStatus: (s) => s >= 200 && s < 300,
});

function sanitizeSegment(value, fallback) {
  const s = String(value || fallback || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return s.slice(0, 120) || fallback;
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function guessExtension(url, mediaType) {
  // Videos ALWAYS get .mp4. Instagram's video URLs can include ".png"
  // or ".jpg" in their path (it's a CDN transform code, not the real
  // media format) and saving MP4 bytes under those extensions makes
  // express-static serve image/png, which <video> refuses to decode.
  if (mediaType === 'video') return '.mp4';

  try {
    const { pathname } = new URL(url);
    const ext = path.extname(pathname).toLowerCase();
    if (IMAGE_EXT.has(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  } catch (_) {
    /* ignore */
  }
  return '.jpg';
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function describeError(err) {
  if (!err) return 'unknown error';
  if (err.response) {
    const status = err.response.status;
    const statusText = err.response.statusText || '';
    return `HTTP ${status}${statusText ? ' ' + statusText : ''}`;
  }
  if (err.code) return `${err.code}${err.message ? ' (' + err.message + ')' : ''}`;
  return err.message || String(err);
}

async function downloadFile(url, destAbs) {
  let res;
  try {
    res = await downloader.get(url);
  } catch (err) {
    // If the server answered with a non-2xx, axios still attaches the
    // response stream — drain it so the TCP socket can be reused/closed
    // instead of leaking listeners.
    const stream = err && err.response && err.response.data;
    if (stream && typeof stream.resume === 'function') stream.resume();
    throw new Error(describeError(err));
  }

  try {
    await pipeline(res.data, fs.createWriteStream(destAbs));
  } catch (err) {
    if (res.data && typeof res.data.resume === 'function') res.data.resume();
    await fsp.rm(destAbs, { force: true }).catch(() => {});
    throw new Error(describeError(err));
  }
}

async function downloadMedia({ username, post_id, media_type, media_url, position }) {
  const user = sanitizeSegment(username, 'unknown');
  const pid = sanitizeSegment(post_id, 'post');
  const ext = guessExtension(media_url, media_type);
  const filename = `${position || 0}${ext}`;

  const relDir = path.join(user, pid);
  const absDir = path.join(config.media.absDir, relDir);
  await ensureDir(absDir);

  const absPath = path.join(absDir, filename);
  const relPath = path.posix.join(relDir.split(path.sep).join('/'), filename);

  try {
    await downloadFile(media_url, absPath);
    return {
      local_path: relPath,
      public_url: `${config.media.urlPrefix}/${relPath}`,
    };
  } catch (err) {
    console.warn(
      `[media] failed to download for post ${post_id} (${media_url.slice(0, 120)}…): ${err.message}`
    );
    return null;
  }
}

module.exports = { downloadMedia };
