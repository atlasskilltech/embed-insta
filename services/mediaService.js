const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const axios = require('axios');
const config = require('../config');

function sanitizeSegment(value, fallback) {
  const s = String(value || fallback || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return s.slice(0, 120) || fallback;
}

function guessExtension(url, mediaType) {
  try {
    const { pathname } = new URL(url);
    const ext = path.extname(pathname).toLowerCase();
    if (ext && ext.length <= 6) return ext;
  } catch (_) {
    /* ignore */
  }
  return mediaType === 'video' ? '.mp4' : '.jpg';
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function downloadFile(url, destAbs) {
  const res = await axios.get(url, {
    responseType: 'stream',
    timeout: 60000,
    maxRedirects: 5,
  });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destAbs);
    res.data.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    res.data.on('error', reject);
  });
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
      `[media] failed to download ${media_url} for post ${post_id}: ${err.message}`
    );
    return null;
  }
}

module.exports = { downloadMedia };
