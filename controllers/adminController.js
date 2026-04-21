const AdminUser = require('../models/AdminUser');
const WidgetSettings = require('../models/WidgetSettings');
const Post = require('../models/Post');
const { ingest } = require('../services/ingestService');
const config = require('../config');

function setFlash(req, type, message) {
  if (!req.session) return;
  req.session.flash = { type, message };
}

function loginPage(req, res) {
  res.render('admin/login', {
    title: 'Admin Login',
    layout: false,
    next: typeof req.query.next === 'string' ? req.query.next : '/admin',
    error: null,
    username: '',
  });
}

async function loginSubmit(req, res, next) {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    const nextUrl = typeof req.body.next === 'string' && req.body.next.startsWith('/')
      ? req.body.next
      : '/admin';

    if (!username || !password) {
      return res.status(400).render('admin/login', {
        title: 'Admin Login',
        layout: false,
        next: nextUrl,
        error: 'Enter your username and password.',
        username,
      });
    }

    const user = await AdminUser.findByUsername(username);
    const ok = user && user.is_active && (await AdminUser.verifyPassword(user, password));
    if (!ok) {
      return res.status(401).render('admin/login', {
        title: 'Admin Login',
        layout: false,
        next: nextUrl,
        error: 'Invalid username or password.',
        username,
      });
    }

    await AdminUser.touchLogin(user.id);
    req.session.admin = {
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
    };
    setFlash(req, 'success', `Welcome back, ${user.display_name || user.username}.`);
    return res.redirect(nextUrl);
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/admin/login');
    });
    return;
  }
  res.redirect('/admin/login');
}

async function dashboard(req, res, next) {
  try {
    const [settings, posts] = await Promise.all([
      WidgetSettings.getActive(),
      Post.listPosts({ page: 1, pageSize: 8 }),
    ]);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      layout: false,
      settings,
      stats: { totalPosts: posts.total },
      recent: posts.rows,
      defaultTargets: config.targets,
      baseUrl: config.baseUrl,
    });
  } catch (err) {
    next(err);
  }
}

async function settingsPage(req, res, next) {
  try {
    const settings = await WidgetSettings.getActive();
    res.render('admin/settings', {
      title: 'Widget Design',
      layout: false,
      settings,
      baseUrl: config.baseUrl,
    });
  } catch (err) {
    next(err);
  }
}

async function settingsSubmit(req, res, next) {
  try {
    const body = req.body || {};
    await WidgetSettings.update(
      {
        layout: body.layout,
        columns: body.columns,
        card_radius: body.card_radius,
        gap: body.gap,
        show_caption: body.show_caption === 'on' || body.show_caption === '1',
        show_stats: body.show_stats === 'on' || body.show_stats === '1',
        show_username: body.show_username === 'on' || body.show_username === '1',
        accent_color: body.accent_color,
        background: body.background,
        text_color: body.text_color,
        border_color: body.border_color,
        font_family: body.font_family,
        max_items: body.max_items,
      },
      req.session.admin && req.session.admin.id
    );
    setFlash(req, 'success', 'Widget design updated.');
    res.redirect('/admin/settings');
  } catch (err) {
    next(err);
  }
}

async function fetchNow(req, res, next) {
  try {
    const body = req.body || {};
    const targets = typeof body.targets === 'string'
      ? body.targets.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean)
      : Array.isArray(body.targets) ? body.targets : undefined;

    const summary = await ingest({
      targets: targets && targets.length ? targets : undefined,
      resultsLimit: body.resultsLimit ? parseInt(body.resultsLimit, 10) : undefined,
      includeComments: body.includeComments === 'on' || body.includeComments === '1',
      downloadMedia: !(body.downloadMedia === 'off' || body.downloadMedia === '0'),
    });

    if (req.accepts(['html', 'json']) === 'json') {
      return res.json({ ok: true, summary });
    }
    setFlash(
      req,
      'success',
      `Fetched ${summary.fetched} items, saved ${summary.savedPosts} posts, ${summary.savedMedia} media.`
    );
    return res.redirect('/admin');
  } catch (err) {
    console.error('[admin] fetch failed:', err);
    if (req.accepts(['html', 'json']) === 'json') {
      return res.status(500).json({ ok: false, error: err.message });
    }
    setFlash(req, 'error', `Fetch failed: ${err.message}`);
    return res.redirect('/admin');
  }
}

module.exports = {
  loginPage,
  loginSubmit,
  logout,
  dashboard,
  settingsPage,
  settingsSubmit,
  fetchNow,
};
