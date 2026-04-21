const Post = require('../models/Post');
const Media = require('../models/Media');
const Comment = require('../models/Comment');
const WidgetSettings = require('../models/WidgetSettings');
const config = require('../config');
const { postToPublic } = require('./apiController');

async function feed(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 24, 100);
    const username = req.query.username || null;

    const { rows, total } = await Post.listPosts({ page, pageSize, username });
    const mediaByPost = await Media.findByPostIds(rows.map((r) => r.post_id));
    const posts = rows.map((r) => postToPublic(r, mediaByPost[r.post_id] || []));

    res.render('feed', {
      title: username ? `@${username}` : 'Instagram Feed',
      posts,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 0,
      username,
      baseUrl: config.baseUrl,
    });
  } catch (err) {
    next(err);
  }
}

async function postDetail(req, res, next) {
  try {
    const post = await Post.findByPostId(req.params.postId);
    if (!post) return res.status(404).render('404', { title: 'Not found' });
    const [media, comments] = await Promise.all([
      Media.findByPostId(post.post_id),
      Comment.findByPostId(post.post_id),
    ]);
    res.render('post', {
      title: post.username ? `@${post.username}` : 'Post',
      post: postToPublic(post, media, comments),
      baseUrl: config.baseUrl,
    });
  } catch (err) {
    next(err);
  }
}

async function embed(req, res, next) {
  try {
    const post = await Post.findByPostId(req.params.postId);
    if (!post) return res.status(404).render('404', { title: 'Not found' });
    const [media, settings] = await Promise.all([
      Media.findByPostId(post.post_id),
      WidgetSettings.getActive(),
    ]);
    res.removeHeader('X-Frame-Options');
    res.set('Content-Security-Policy', "frame-ancestors *");
    res.render('embed', {
      title: 'Embed',
      post: postToPublic(post, media),
      settings,
      baseUrl: config.baseUrl,
      layout: false,
    });
  } catch (err) {
    next(err);
  }
}

async function embedFeed(req, res, next) {
  try {
    const settings = await WidgetSettings.getActive();
    const pageSize = Math.min(
      Math.max(parseInt(req.query.limit, 10) || settings.max_items || 9, 1),
      60
    );
    const username = req.query.username || null;
    const { rows } = await Post.listPosts({ page: 1, pageSize, username });
    const mediaByPost = await Media.findByPostIds(rows.map((r) => r.post_id));
    const posts = rows.map((r) => postToPublic(r, mediaByPost[r.post_id] || []));
    res.removeHeader('X-Frame-Options');
    res.set('Content-Security-Policy', "frame-ancestors *");
    res.render('embedFeed', {
      title: 'Embed Feed',
      posts,
      settings,
      baseUrl: config.baseUrl,
      layout: false,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { feed, postDetail, embed, embedFeed };
