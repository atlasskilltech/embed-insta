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
const CONTENT_TYPE_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.jpg', // served to browsers as jpg after CDN transform
  'image/heif': '.jpg',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'application/octet-stream': null, // fall through
};

function extFromContentType(contentType) {
  if (!contentType) return null;
  const type = String(contentType).split(';')[0].trim().toLowerCase();
  const mapped = CONTENT_TYPE_EXT[type];
  return mapped === undefined ? null : mapped;
}

function extFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    const ext = path.extname(pathname).toLowerCase();
    if (IMAGE_EXT.has(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  } catch (_) {
    /* ignore */
  }
  return null;
}

function pickExtension({ mediaType, contentType, url }) {
  // Videos always play from .mp4 on our side. Instagram's video URLs
  // frequently contain ".png" in the path (a CDN transform code) so
  // trusting the URL extension would mis-save the MP4 bytes.
  if (mediaType === 'video') {
    const fromCt = extFromContentType(contentType);
    if (fromCt && fromCt !== '.jpg' && fromCt !== '.png' && fromCt !== '.webp') {
      return fromCt;
    }
    return '.mp4';
  }
  // Images: prefer Content-Type (authoritative — Instagram's
  // dst-jpg transform returns image/jpeg even for URLs ending in
  // .png or .heic), then fall back to a whitelisted URL extension,
  // then .jpg.
  return extFromContentType(contentType) || extFromUrl(url) || '.jpg';
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

async function downloadTo(url, absDir, baseName, mediaType) {
  let res;
  try {
    res = await downloader.get(url);
  } catch (err) {
    const stream = err && err.response && err.response.data;
    if (stream && typeof stream.resume === 'function') stream.resume();
    throw new Error(describeError(err));
  }

  const ext = pickExtension({
    mediaType,
    contentType: res.headers && res.headers['content-type'],
    url,
  });
  const filename = `${baseName}${ext}`;
  const absPath = path.join(absDir, filename);

  try {
    await pipeline(res.data, fs.createWriteStream(absPath));
  } catch (err) {
    if (res.data && typeof res.data.resume === 'function') res.data.resume();
    await fsp.rm(absPath, { force: true }).catch(() => {});
    throw new Error(describeError(err));
  }

  return { absPath, filename };
}

async function downloadMedia({ username, post_id, media_type, media_url, position }) {
  const user = sanitizeSegment(username, 'unknown');
  const pid = sanitizeSegment(post_id, 'post');
  const baseName = String(position || 0);

  const relDir = path.join(user, pid);
  const absDir = path.join(config.media.absDir, relDir);
  await ensureDir(absDir);

  try {
    const { filename } = await downloadTo(media_url, absDir, baseName, media_type);
    const relPath = path.posix.join(
      relDir.split(path.sep).join('/'),
      filename
    );
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
