function extractShortcode(url) {
  if (!url) return null;
  const m = String(url).match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function pickType(item) {
  const t = (item.type || item.productType || '').toString().toLowerCase();
  if (t.includes('video')) return 'video';
  if (t.includes('sidecar') || t.includes('carousel')) return 'carousel';
  if (t.includes('image')) return 'image';
  if (Array.isArray(item.childPosts) && item.childPosts.length > 0) return 'carousel';
  if (item.videoUrl) return 'video';
  return 'image';
}

function collectMedia(item) {
  const media = [];
  const children = Array.isArray(item.childPosts) && item.childPosts.length
    ? item.childPosts
    : [item];

  children.forEach((child, i) => {
    const isVideo = Boolean(child.videoUrl) || /video/i.test(child.type || '');
    const url = isVideo
      ? child.videoUrl || child.displayUrl
      : child.displayUrl || child.imageUrl || child.url;
    if (!url) return;
    media.push({
      position: i,
      media_type: isVideo ? 'video' : 'image',
      media_url: url,
      thumbnail_url: child.displayUrl || null,
      width: child.dimensionsWidth || child.width || null,
      height: child.dimensionsHeight || child.height || null,
    });
  });

  return media;
}

function normalize(item) {
  if (!item) return null;

  const permalink = item.url || item.postUrl || null;
  const shortcode = item.shortCode || item.shortcode || extractShortcode(permalink);
  const postId = item.id || shortcode || permalink;
  if (!postId) return null;

  const username =
    item.ownerUsername || item.username || (item.owner && item.owner.username) || null;
  const fullName =
    item.ownerFullName || (item.owner && item.owner.full_name) || null;

  return {
    post: {
      post_id: String(postId),
      shortcode: shortcode || null,
      username,
      owner_full_name: fullName,
      caption: item.caption || null,
      permalink,
      post_type: pickType(item),
      likes_count: Number(item.likesCount || item.likes || 0) || 0,
      comments_count: Number(item.commentsCount || item.comments || 0) || 0,
      posted_at: parseDate(item.timestamp || item.takenAtTimestamp || item.takenAt),
      raw_json: JSON.stringify(item),
    },
    media: collectMedia(item),
  };
}

function normalizeBatch(items) {
  const seen = new Set();
  const out = [];
  for (const raw of items || []) {
    const n = normalize(raw);
    if (!n) continue;
    if (!n.post.permalink && !n.post.shortcode) continue;
    if (seen.has(n.post.post_id)) continue;
    seen.add(n.post.post_id);
    out.push(n);
  }
  return out;
}

module.exports = { normalize, normalizeBatch, extractShortcode };
