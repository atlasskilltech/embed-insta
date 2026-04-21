const path = require('path');
const fsp = require('fs').promises;
const AdminUser = require('../models/AdminUser');
const WidgetSettings = require('../models/WidgetSettings');
const Post = require('../models/Post');
const Media = require('../models/Media');
const GraphAccount = require('../models/GraphAccount');
const { ingest, ingestFromGraph, ingestGraphAccount } = require('../services/ingestService');
const { downloadMedia } = require('../services/mediaService');
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
    const [settings, posts, graphAccounts] = await Promise.all([
      WidgetSettings.getActive(),
      Post.listPosts({ page: 1, pageSize: 8 }),
      GraphAccount.list().catch(() => []),
    ]);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      layout: false,
      settings,
      stats: { totalPosts: posts.total },
      recent: posts.rows,
      defaultTargets: config.targets,
      graphAccounts: graphAccounts.map((a) => ({
        ...a,
        masked_token: GraphAccount.maskToken(a.access_token),
      })),
      baseUrl: config.baseUrl,
    });
  } catch (err) {
    next(err);
  }
}

function bodyToPatch(body) {
  return {
    title: body.title,
    targets: body.targets,
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
  };
}

async function widgetsList(req, res, next) {
  try {
    const rows = await WidgetSettings.list();
    res.render('admin/widgets', {
      title: 'Widgets',
      layout: false,
      widgets: rows.map((w) => ({
        ...w,
        targets: WidgetSettings.targetsToDisplay(w),
      })),
      baseUrl: config.baseUrl,
    });
  } catch (err) {
    next(err);
  }
}

async function widgetNewPage(req, res, next) {
  try {
    res.render('admin/widget-edit', {
      title: 'New widget',
      layout: false,
      mode: 'create',
      widget: { name: '', ...WidgetSettings.DEFAULTS, title: '' },
      targetsText: '',
      layouts: WidgetSettings.LAYOUTS,
      baseUrl: config.baseUrl,
      error: null,
    });
  } catch (err) {
    next(err);
  }
}

async function widgetCreate(req, res, next) {
  try {
    const body = req.body || {};
    const patch = bodyToPatch(body);
    const slug = WidgetSettings.sanitizeSlug(body.slug);
    if (!slug) {
      return res.status(400).render('admin/widget-edit', {
        title: 'New widget',
        layout: false,
        mode: 'create',
        widget: { name: body.slug || '', ...WidgetSettings.DEFAULTS, title: body.title || '' },
        targetsText: body.targets || '',
        layouts: WidgetSettings.LAYOUTS,
        baseUrl: config.baseUrl,
        error: 'Slug must be 1-64 chars of a-z, 0-9, or -',
      });
    }
    try {
      await WidgetSettings.create(
        { slug, ...patch },
        req.session.admin && req.session.admin.id
      );
    } catch (err) {
      return res.status(400).render('admin/widget-edit', {
        title: 'New widget',
        layout: false,
        mode: 'create',
        widget: { name: slug, ...WidgetSettings.DEFAULTS, ...patch },
        targetsText: body.targets || '',
        layouts: WidgetSettings.LAYOUTS,
        baseUrl: config.baseUrl,
        error: err.message,
      });
    }
    setFlash(req, 'success', `Widget "${slug}" created.`);
    res.redirect(`/admin/widgets/${slug}`);
  } catch (err) {
    next(err);
  }
}

async function widgetEditPage(req, res, next) {
  try {
    const widget = await WidgetSettings.findBySlug(req.params.slug);
    if (!widget) return res.status(404).render('404', { title: 'Widget not found' });
    res.render('admin/widget-edit', {
      title: `Widget · ${widget.title || widget.name}`,
      layout: false,
      mode: 'edit',
      widget,
      targetsText: WidgetSettings.targetsToDisplay(widget).join('\n'),
      layouts: WidgetSettings.LAYOUTS,
      baseUrl: config.baseUrl,
      error: null,
    });
  } catch (err) {
    next(err);
  }
}

async function widgetUpdate(req, res, next) {
  try {
    const widget = await WidgetSettings.findBySlug(req.params.slug);
    if (!widget) return res.status(404).render('404', { title: 'Widget not found' });
    await WidgetSettings.update(
      widget.name,
      bodyToPatch(req.body || {}),
      req.session.admin && req.session.admin.id
    );
    setFlash(req, 'success', `Widget "${widget.name}" updated.`);
    res.redirect(`/admin/widgets/${widget.name}`);
  } catch (err) {
    next(err);
  }
}

async function widgetDelete(req, res, next) {
  try {
    await WidgetSettings.remove(req.params.slug);
    setFlash(req, 'success', `Widget "${req.params.slug}" deleted.`);
    res.redirect('/admin/widgets');
  } catch (err) {
    setFlash(req, 'error', err.message);
    res.redirect('/admin/widgets');
  }
}

function settingsPage(req, res) {
  res.redirect('/admin/widgets/default');
}

async function redownloadMissingMedia(req, res) {
  const limit = Math.min(Math.max(parseInt(req.body.limit || req.query.limit, 10) || 100, 1), 500);
  try {
    // Clear videos that were previously mirrored with a non-video
    // extension (Instagram video URLs contain ".png" / ".jpg" in their
    // path so older ingests saved the MP4 bytes as image/png). Removing
    // the file + clearing local_path lets the download loop below
    // re-mirror them with the correct .mp4 extension.
    const badVideos = await Media.findBadVideoMirrors();
    let cleaned = 0;
    for (const m of badVideos) {
      if (m.local_path) {
        const abs = path.resolve(config.media.absDir, m.local_path);
        await fsp.rm(abs, { force: true }).catch(() => {});
      }
      await Media.clearLocalPath(m.id);
      cleaned += 1;
    }

    const missing = await Media.findMissingLocal(limit);
    let downloaded = 0;
    let failed = 0;
    for (const m of missing) {
      const result = await downloadMedia({
        username: m.username,
        post_id: m.post_id,
        media_type: m.media_type,
        media_url: m.media_url,
        thumbnail_url: m.thumbnail_url,
        position: m.position,
        skip_primary: Boolean(m.local_path),
        skip_thumbnail: Boolean(m.local_thumbnail_path),
      });
      const paths = {};
      if (result && result.local_path) paths.local_path = result.local_path;
      if (result && result.local_thumbnail_path) {
        paths.local_thumbnail_path = result.local_thumbnail_path;
      }
      if (paths.local_path || paths.local_thumbnail_path) {
        await Media.setLocalPaths(m.id, paths);
        downloaded += 1;
      } else {
        failed += 1;
      }
    }
    const message =
      `Redownload: cleaned ${cleaned} mis-extensioned videos, ` +
      `${downloaded} succeeded, ${failed} failed, ` +
      `${missing.length} attempted (up to ${limit}).`;
    if (req.accepts(['html', 'json']) === 'json') {
      return res.json({
        ok: true,
        cleaned,
        downloaded,
        failed,
        attempted: missing.length,
      });
    }
    setFlash(req, downloaded || cleaned ? 'success' : 'error', message);
    return res.redirect('/admin');
  } catch (err) {
    console.error('[admin] redownload failed:', err);
    if (req.accepts(['html', 'json']) === 'json') {
      return res.status(500).json({ ok: false, error: err.message });
    }
    setFlash(req, 'error', `Redownload failed: ${err.message}`);
    return res.redirect('/admin');
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

function bodyToGraphPatch(body) {
  return {
    label: body.label,
    ig_business_id: body.ig_business_id,
    fb_page_id: body.fb_page_id || null,
    access_token: body.access_token,
    api_version: body.api_version || 'v21.0',
    results_limit: body.results_limit,
    include_comments: body.include_comments === 'on' || body.include_comments === '1',
    is_active: body.is_active === undefined
      ? undefined
      : body.is_active === 'on' || body.is_active === '1',
  };
}

async function graphAccountsList(req, res, next) {
  try {
    const rows = await GraphAccount.list();
    res.render('admin/graph-accounts', {
      title: 'Graph API accounts',
      layout: false,
      accounts: rows.map((a) => ({
        ...a,
        masked_token: GraphAccount.maskToken(a.access_token),
      })),
      baseUrl: config.baseUrl,
    });
  } catch (err) {
    next(err);
  }
}

async function graphAccountNewPage(req, res, next) {
  try {
    res.render('admin/graph-account-edit', {
      title: 'Add Graph API account',
      layout: false,
      mode: 'create',
      account: {
        label: '',
        ig_business_id: '',
        fb_page_id: '',
        access_token: '',
        api_version: 'v21.0',
        results_limit: 25,
        include_comments: false,
        is_active: true,
      },
      error: null,
      baseUrl: config.baseUrl,
    });
  } catch (err) {
    next(err);
  }
}

async function graphAccountCreate(req, res, next) {
  const body = req.body || {};
  try {
    // Patch includes only provided fields; fill sensible defaults for
    // create so missing checkboxes don't silently go false.
    const patch = bodyToGraphPatch(body);
    if (patch.is_active === undefined) patch.is_active = true;
    const created = await GraphAccount.create(patch);
    setFlash(req, 'success', `Graph account "${created.label}" added.`);
    res.redirect('/admin/graph');
  } catch (err) {
    res.status(400).render('admin/graph-account-edit', {
      title: 'Add Graph API account',
      layout: false,
      mode: 'create',
      account: {
        label: body.label || '',
        ig_business_id: body.ig_business_id || '',
        fb_page_id: body.fb_page_id || '',
        access_token: body.access_token || '',
        api_version: body.api_version || 'v21.0',
        results_limit: body.results_limit || 25,
        include_comments: body.include_comments === 'on',
        is_active: body.is_active !== undefined ? body.is_active === 'on' : true,
      },
      error: err.message,
      baseUrl: config.baseUrl,
    });
  }
}

async function graphAccountEditPage(req, res, next) {
  try {
    const account = await GraphAccount.findById(req.params.id);
    if (!account) return res.status(404).render('404', { title: 'Account not found' });
    res.render('admin/graph-account-edit', {
      title: `Graph API · ${account.label}`,
      layout: false,
      mode: 'edit',
      account: {
        ...account,
        masked_token: GraphAccount.maskToken(account.access_token),
      },
      error: null,
      baseUrl: config.baseUrl,
    });
  } catch (err) {
    next(err);
  }
}

async function graphAccountUpdate(req, res, next) {
  try {
    const id = Number(req.params.id);
    const account = await GraphAccount.findById(id);
    if (!account) return res.status(404).render('404', { title: 'Account not found' });
    const body = req.body || {};
    const patch = bodyToGraphPatch(body);
    // Preserve existing token if the form left it blank (UI shows a
    // masked value; an empty submit means "don't rotate").
    if (!patch.access_token) delete patch.access_token;
    // Checkboxes collapse to undefined when unchecked — force false so
    // the user can actually turn them off.
    if (patch.is_active === undefined) patch.is_active = false;
    if (patch.include_comments === undefined) patch.include_comments = false;
    await GraphAccount.update(id, patch);
    setFlash(req, 'success', `Graph account "${account.label}" updated.`);
    res.redirect(`/admin/graph/${id}`);
  } catch (err) {
    setFlash(req, 'error', err.message);
    res.redirect(`/admin/graph/${req.params.id}`);
  }
}

async function graphAccountDelete(req, res) {
  try {
    await GraphAccount.remove(Number(req.params.id));
    setFlash(req, 'success', 'Graph account removed.');
  } catch (err) {
    setFlash(req, 'error', `Delete failed: ${err.message}`);
  }
  res.redirect('/admin/graph');
}

async function graphFetchNow(req, res) {
  const wantsJson = req.accepts(['html', 'json']) === 'json';
  const id = req.params.id ? Number(req.params.id) : null;
  try {
    let summary;
    if (id) {
      const account = await GraphAccount.findById(id);
      if (!account) {
        if (wantsJson) return res.status(404).json({ ok: false, error: 'not found' });
        setFlash(req, 'error', 'Graph account not found.');
        return res.redirect('/admin/graph');
      }
      summary = await ingestGraphAccount(account, {
        downloadMedia: !(req.body && req.body.downloadMedia === 'off'),
      });
      await GraphAccount.markFetched(account.id);
    } else {
      summary = await ingestFromGraph({
        downloadMedia: !(req.body && req.body.downloadMedia === 'off'),
      });
    }
    if (wantsJson) return res.json({ ok: true, summary });
    const msg = id
      ? `Graph fetch: ${summary.fetched} items, ${summary.savedPosts} posts, ${summary.savedMedia} media.`
      : `Graph fetch: ${summary.savedPosts} posts across ${summary.accounts ? summary.accounts.length : 0} account(s).`;
    setFlash(req, 'success', msg);
    res.redirect(id ? `/admin/graph/${id}` : '/admin/graph');
  } catch (err) {
    console.error('[admin] graph fetch failed:', err);
    if (id && err && err.message) {
      await GraphAccount.markError(id, err.message).catch(() => {});
    }
    if (wantsJson) return res.status(500).json({ ok: false, error: err.message });
    setFlash(req, 'error', `Graph fetch failed: ${err.message}`);
    res.redirect(id ? `/admin/graph/${id}` : '/admin/graph');
  }
}

module.exports = {
  loginPage,
  loginSubmit,
  logout,
  dashboard,
  settingsPage,
  widgetsList,
  widgetNewPage,
  widgetCreate,
  widgetEditPage,
  widgetUpdate,
  widgetDelete,
  fetchNow,
  redownloadMissingMedia,
  graphAccountsList,
  graphAccountNewPage,
  graphAccountCreate,
  graphAccountEditPage,
  graphAccountUpdate,
  graphAccountDelete,
  graphFetchNow,
};
