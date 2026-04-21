const config = require('../config');

function requireApiKey(req, res, next) {
  if (!config.apiKey) return next();
  const key = req.get('X-API-Key') || req.query.api_key;
  if (key && key === config.apiKey) return next();
  return res.status(401).json({ error: 'invalid or missing API key' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin && req.session.admin.id) return next();
  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(401).json({ ok: false, error: 'admin session required' });
  }
  const redirectTo = encodeURIComponent(req.originalUrl || '/admin');
  return res.redirect(`/admin/login?next=${redirectTo}`);
}

function redirectIfAuthed(req, res, next) {
  if (req.session && req.session.admin && req.session.admin.id) {
    return res.redirect('/admin');
  }
  return next();
}

function exposeAdminLocals(req, res, next) {
  res.locals.admin = (req.session && req.session.admin) || null;
  res.locals.flash = (req.session && req.session.flash) || null;
  if (req.session) req.session.flash = null;
  next();
}

module.exports = { requireApiKey, requireAdmin, redirectIfAuthed, exposeAdminLocals };
