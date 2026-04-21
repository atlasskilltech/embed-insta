const Post = require('../models/Post');
const Media = require('../models/Media');
const Comment = require('../models/Comment');
const { ingest } = require('../services/ingestService');
const config = require('../config');

function parseJson(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function postToPublic(post, media = [], comments = []) {
  if (!post) return null;
  const hashtags = parseJson(post.hashtags) || [];
  const mentions = parseJson(post.mentions) || [];
  const taggedUsers = parseJson(post.tagged_users_json) || [];
  const coauthors = parseJson(post.coauthors_json) || [];

  return {
    post_id: post.post_id,
    shortcode: post.shortcode,
    username: post.username,
    owner_full_name: post.owner_full_name,
    owner_id: post.owner_id,
    caption: post.caption,
    alt_text: post.alt_text,
    permalink: post.permalink,
    post_type: post.post_type,
    product_type: post.product_type,
    likes_count: post.likes_count,
    comments_count: post.comments_count,
    video_url: post.video_url,
    video_view_count: post.video_view_count,
    video_play_count: post.video_play_count,
    video_duration: post.video_duration != null ? Number(post.video_duration) : null,
    location: post.location_name
      ? { name: post.location_name, id: post.location_id }
      : null,
    music:
      post.music_song || post.music_artist
        ? {
            song: post.music_song,
            artist: post.music_artist,
            audio_id: post.music_audio_id,
          }
        : null,
    hashtags,
    mentions,
    tagged_users: taggedUsers.map((u) => ({
      username: u.username,
      full_name: u.full_name,
      is_verified: u.is_verified || false,
    })),
    coauthors: coauthors.map((u) => ({
      username: u.username,
      is_verified: u.is_verified || false,
    })),
    is_pinned: Boolean(post.is_pinned),
    is_comments_disabled: Boolean(post.is_comments_disabled),
    first_comment: post.first_comment,
    posted_at: post.posted_at,
    media: media.map((m) => {
      const pos = m.position || 0;
      return {
        position: pos,
        media_type: m.media_type,
        media_url: m.media_url,
        local_url: m.local_path ? `${config.media.urlPrefix}/${m.local_path}` : null,
        local_thumbnail_url: m.local_thumbnail_path
          ? `${config.media.urlPrefix}/${m.local_thumbnail_path}`
          : null,
        proxy_url: m.media_url
          ? `/proxy/media/${encodeURIComponent(post.post_id)}/${pos}`
          : null,
        proxy_thumbnail_url:
          m.thumbnail_url || m.media_url
            ? `/proxy/media/${encodeURIComponent(post.post_id)}/${pos}/thumb`
            : null,
        thumbnail_url: m.thumbnail_url,
        alt_text: m.alt_text,
        width: m.width,
        height: m.height,
        child_shortcode: m.child_shortcode,
      };
    }),
    comments: comments.map((c) => ({
      id: c.comment_id,
      owner_username: c.owner_username,
      text: c.text,
      likes_count: c.likes_count,
      replies_count: c.replies_count,
      parent_comment_id: c.parent_comment_id,
      posted_at: c.posted_at,
    })),
    embed_url: `${config.baseUrl}/embed/${post.post_id}`,
  };
}

async function fetchNow(req, res) {
  try {
    const body = req.body || {};
    const summary = await ingest({
      targets: body.targets,
      resultsLimit: body.resultsLimit,
      includeComments: body.includeComments,
      downloadMedia: body.downloadMedia,
    });
    res.json({ ok: true, summary });
  } catch (err) {
    console.error('[api] fetch failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function list(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 20, 100);
    const username = req.query.username || null;

    const { rows, total } = await Post.listPosts({ page, pageSize, username });
    const mediaByPost = await Media.findByPostIds(rows.map((r) => r.post_id));

    res.json({
      ok: true,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 0,
      posts: rows.map((r) => postToPublic(r, mediaByPost[r.post_id] || [])),
    });
  } catch (err) {
    console.error('[api] list failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function get(req, res) {
  try {
    const post = await Post.findByPostId(req.params.postId);
    if (!post) return res.status(404).json({ ok: false, error: 'not found' });
    const [media, comments] = await Promise.all([
      Media.findByPostId(post.post_id),
      Comment.findByPostId(post.post_id),
    ]);
    res.json({ ok: true, post: postToPublic(post, media, comments) });
  } catch (err) {
    console.error('[api] get failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function embedJson(req, res) {
  try {
    const post = await Post.findByPostId(req.params.postId);
    if (!post) return res.status(404).json({ ok: false, error: 'not found' });
    const media = await Media.findByPostId(post.post_id);
    const width = 540;
    const height = 720;
    res.json({
      ok: true,
      html: `<iframe src="${config.baseUrl}/embed/${post.post_id}" width="${width}" height="${height}" frameborder="0" scrolling="no" allowtransparency="true"></iframe>`,
      width,
      height,
      post: postToPublic(post, media),
    });
  } catch (err) {
    console.error('[api] embed failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { fetchNow, list, get, embedJson, postToPublic };
