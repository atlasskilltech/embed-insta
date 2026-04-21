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

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function toBool(value) {
  if (value === true || value === 1 || value === '1') return 1;
  return 0;
}

function pickType(item) {
  const raw = String(item.type || item.productType || '').toLowerCase();
  if (raw === 'sidecar' || raw.includes('carousel')) return 'carousel';
  if (raw === 'video' || raw.includes('video') || raw === 'clips') return 'video';
  if (raw === 'image' || raw.includes('image')) return 'image';
  if (Array.isArray(item.childPosts) && item.childPosts.length > 0) return 'carousel';
  if (item.videoUrl) return 'video';
  return 'image';
}

function mediaFromChild(child, position) {
  const isVideo = Boolean(child.videoUrl);
  const url = isVideo ? child.videoUrl : child.displayUrl || child.imageUrl || child.url;
  if (!url) return null;
  return {
    position,
    child_post_id: child.id ? String(child.id) : null,
    child_shortcode: child.shortCode || child.shortcode || null,
    media_type: isVideo ? 'video' : 'image',
    media_url: url,
    thumbnail_url: child.displayUrl || null,
    alt_text: child.alt || null,
    width: child.dimensionsWidth || child.width || null,
    height: child.dimensionsHeight || child.height || null,
  };
}

function collectMedia(item) {
  const out = [];

  if (Array.isArray(item.childPosts) && item.childPosts.length > 0) {
    item.childPosts.forEach((child, i) => {
      const m = mediaFromChild(child, i);
      if (m) out.push(m);
    });
    return out;
  }

  const isVideo = Boolean(item.videoUrl);
  const primary = isVideo ? item.videoUrl : item.displayUrl;
  if (primary) {
    out.push({
      position: 0,
      child_post_id: null,
      child_shortcode: null,
      media_type: isVideo ? 'video' : 'image',
      media_url: primary,
      thumbnail_url: item.displayUrl || null,
      alt_text: item.alt || null,
      width: item.dimensionsWidth || null,
      height: item.dimensionsHeight || null,
    });
  }

  if (!isVideo && Array.isArray(item.images) && item.images.length > 1) {
    item.images.slice(1).forEach((url, idx) => {
      if (!url) return;
      out.push({
        position: idx + 1,
        child_post_id: null,
        child_shortcode: null,
        media_type: 'image',
        media_url: url,
        thumbnail_url: null,
        alt_text: null,
        width: null,
        height: null,
      });
    });
  }

  return out;
}

function collectComments(item) {
  const out = [];
  const list = Array.isArray(item.latestComments) ? item.latestComments : [];
  for (const c of list) {
    if (!c || !c.id) continue;
    out.push({
      comment_id: String(c.id),
      owner_username: c.ownerUsername || (c.owner && c.owner.username) || null,
      owner_id: (c.owner && c.owner.id) ? String(c.owner.id) : null,
      text: c.text || null,
      likes_count: toInt(c.likesCount) || 0,
      replies_count: toInt(c.repliesCount) || 0,
      parent_comment_id: null,
      posted_at: parseDate(c.timestamp),
    });
    if (Array.isArray(c.replies)) {
      for (const r of c.replies) {
        if (!r || !r.id) continue;
        out.push({
          comment_id: String(r.id),
          owner_username: r.ownerUsername || (r.owner && r.owner.username) || null,
          owner_id: (r.owner && r.owner.id) ? String(r.owner.id) : null,
          text: r.text || null,
          likes_count: toInt(r.likesCount) || 0,
          replies_count: toInt(r.repliesCount) || 0,
          parent_comment_id: String(c.id),
          posted_at: parseDate(r.timestamp),
        });
      }
    }
  }
  return out;
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
  const ownerId = item.ownerId ? String(item.ownerId) : null;

  const music = item.musicInfo || {};

  const post = {
    post_id: String(postId),
    shortcode: shortcode || null,
    username,
    owner_full_name: fullName,
    owner_id: ownerId,
    caption: item.caption || null,
    alt_text: item.alt || null,
    display_url: item.displayUrl || null,
    permalink,
    input_url: item.inputUrl || null,
    post_type: pickType(item),
    product_type: item.productType || null,
    likes_count: toInt(item.likesCount) || 0,
    comments_count: toInt(item.commentsCount) || 0,
    video_url: item.videoUrl || null,
    video_view_count: toInt(item.videoViewCount),
    video_play_count: toInt(item.videoPlayCount),
    video_duration: item.videoDuration != null ? Number(item.videoDuration) : null,
    dimensions_width: toInt(item.dimensionsWidth),
    dimensions_height: toInt(item.dimensionsHeight),
    location_name: item.locationName || null,
    location_id: item.locationId ? String(item.locationId) : null,
    music_song: music.song_name || null,
    music_artist: music.artist_name || null,
    music_audio_id: music.audio_id ? String(music.audio_id) : null,
    hashtags: Array.isArray(item.hashtags) ? JSON.stringify(item.hashtags) : null,
    mentions: Array.isArray(item.mentions) ? JSON.stringify(item.mentions) : null,
    tagged_users_json: Array.isArray(item.taggedUsers)
      ? JSON.stringify(item.taggedUsers)
      : null,
    coauthors_json: Array.isArray(item.coauthorProducers)
      ? JSON.stringify(item.coauthorProducers)
      : null,
    first_comment: item.firstComment || null,
    is_pinned: toBool(item.isPinned),
    is_comments_disabled: toBool(item.isCommentsDisabled),
    posted_at: parseDate(item.timestamp || item.takenAtTimestamp || item.takenAt),
    raw_json: JSON.stringify(item),
  };

  return {
    post,
    media: collectMedia(item),
    comments: collectComments(item),
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

// ---- Graph API adapter ----------------------------------------------------
// Meta's Graph API returns a different shape than the Apify scraper. We
// map it onto the same canonical { post, media, comments } structure so
// the downstream ingest/save loop is source-agnostic.

function mapGraphType(mediaType, productType) {
  const mt = String(mediaType || '').toUpperCase();
  if (mt === 'CAROUSEL_ALBUM') return 'carousel';
  if (mt === 'VIDEO') return 'video';
  if (mt === 'IMAGE') return 'image';
  if (String(productType || '').toUpperCase() === 'REELS') return 'video';
  return 'image';
}

function childToMedia(child, position) {
  const type = String(child.media_type || '').toUpperCase();
  const isVideo = type === 'VIDEO';
  const primary = isVideo ? child.media_url : child.media_url || child.thumbnail_url;
  if (!primary) return null;
  return {
    position,
    child_post_id: child.id ? String(child.id) : null,
    child_shortcode: child.shortcode || null,
    media_type: isVideo ? 'video' : 'image',
    media_url: primary,
    thumbnail_url: child.thumbnail_url || (isVideo ? null : child.media_url) || null,
    alt_text: null,
    width: null,
    height: null,
  };
}

function collectGraphMedia(item) {
  const out = [];
  const type = String(item.media_type || '').toUpperCase();

  if (type === 'CAROUSEL_ALBUM') {
    const children = (item.children && Array.isArray(item.children.data) && item.children.data) || [];
    children.forEach((child, i) => {
      const m = childToMedia(child, i);
      if (m) out.push(m);
    });
    return out;
  }

  const isVideo = type === 'VIDEO';
  const primary = isVideo ? item.media_url : item.media_url || item.thumbnail_url;
  if (!primary) return out;

  out.push({
    position: 0,
    child_post_id: null,
    child_shortcode: null,
    media_type: isVideo ? 'video' : 'image',
    media_url: primary,
    thumbnail_url: item.thumbnail_url || (isVideo ? null : item.media_url) || null,
    alt_text: null,
    width: null,
    height: null,
  });
  return out;
}

function collectGraphComments(item) {
  const list = (item._comments && Array.isArray(item._comments)) ? item._comments : [];
  const out = [];
  for (const c of list) {
    if (!c || !c.id) continue;
    out.push({
      comment_id: String(c.id),
      owner_username: c.username || null,
      owner_id: null,
      text: c.text || null,
      likes_count: toInt(c.like_count) || 0,
      replies_count: 0,
      parent_comment_id: null,
      posted_at: parseDate(c.timestamp),
    });
    if (c.replies && Array.isArray(c.replies.data)) {
      for (const r of c.replies.data) {
        if (!r || !r.id) continue;
        out.push({
          comment_id: String(r.id),
          owner_username: r.username || null,
          owner_id: null,
          text: r.text || null,
          likes_count: toInt(r.like_count) || 0,
          replies_count: 0,
          parent_comment_id: String(c.id),
          posted_at: parseDate(r.timestamp),
        });
      }
    }
  }
  return out;
}

function graphCoverUrl(item) {
  if (item.thumbnail_url) return item.thumbnail_url;
  if (item.media_url) return item.media_url;
  const children = (item.children && Array.isArray(item.children.data) && item.children.data) || [];
  for (const c of children) {
    const type = String(c.media_type || '').toUpperCase();
    if (type === 'IMAGE' && c.media_url) return c.media_url;
    if (type === 'VIDEO' && c.thumbnail_url) return c.thumbnail_url;
  }
  for (const c of children) {
    if (c.media_url) return c.media_url;
    if (c.thumbnail_url) return c.thumbnail_url;
  }
  return null;
}

function normalizeGraphItem(item) {
  if (!item || !item.id) return null;

  const permalink = item.permalink || null;
  const shortcode = item.shortcode || extractShortcode(permalink);
  const postId = String(item.id);

  const username =
    item.username || (item.owner && item.owner.username) || null;
  const ownerId = item.owner && item.owner.id ? String(item.owner.id) : null;

  const post = {
    post_id: postId,
    shortcode: shortcode || null,
    username,
    owner_full_name: null,
    owner_id: ownerId,
    caption: item.caption || null,
    alt_text: null,
    display_url: graphCoverUrl(item),
    permalink,
    input_url: null,
    post_type: mapGraphType(item.media_type, item.media_product_type),
    product_type: item.media_product_type
      ? String(item.media_product_type).toLowerCase()
      : null,
    likes_count: toInt(item.like_count) || 0,
    comments_count: toInt(item.comments_count) || 0,
    video_url: String(item.media_type).toUpperCase() === 'VIDEO' ? item.media_url : null,
    video_view_count: null,
    video_play_count: null,
    video_duration: null,
    dimensions_width: null,
    dimensions_height: null,
    location_name: null,
    location_id: null,
    music_song: null,
    music_artist: null,
    music_audio_id: null,
    hashtags: null,
    mentions: null,
    tagged_users_json: null,
    coauthors_json: null,
    first_comment: null,
    is_pinned: 0,
    is_comments_disabled: item.is_comment_enabled === false ? 1 : 0,
    posted_at: parseDate(item.timestamp),
    raw_json: JSON.stringify(item),
  };

  return {
    post,
    media: collectGraphMedia(item),
    comments: collectGraphComments(item),
  };
}

function normalizeGraphBatch(items) {
  const seen = new Set();
  const out = [];
  for (const raw of items || []) {
    const n = normalizeGraphItem(raw);
    if (!n) continue;
    if (seen.has(n.post.post_id)) continue;
    seen.add(n.post.post_id);
    out.push(n);
  }
  return out;
}

module.exports = {
  normalize,
  normalizeBatch,
  normalizeGraphItem,
  normalizeGraphBatch,
  extractShortcode,
};
