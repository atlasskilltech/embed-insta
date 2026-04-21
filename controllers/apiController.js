const Post = require('../models/Post');
const Media = require('../models/Media');
const { ingest } = require('../services/ingestService');
const config = require('../config');

function postToPublic(post, media = []) {
  if (!post) return null;
  return {
    post_id: post.post_id,
    shortcode: post.shortcode,
    username: post.username,
    owner_full_name: post.owner_full_name,
    caption: post.caption,
    permalink: post.permalink,
    post_type: post.post_type,
    likes_count: post.likes_count,
    comments_count: post.comments_count,
    posted_at: post.posted_at,
    media: media.map((m) => ({
      position: m.position,
      media_type: m.media_type,
      media_url: m.media_url,
      local_url: m.local_path ? `${config.media.urlPrefix}/${m.local_path}` : null,
      thumbnail_url: m.thumbnail_url,
      width: m.width,
      height: m.height,
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
    const media = await Media.findByPostId(post.post_id);
    res.json({ ok: true, post: postToPublic(post, media) });
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
    const height = 720;
    const width = 540;
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
