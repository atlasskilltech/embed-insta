const config = require('../config');

function requireApiKey(req, res, next) {
  if (!config.apiKey) return next();
  const key = req.get('X-API-Key') || req.query.api_key;
  if (key && key === config.apiKey) return next();
  return res.status(401).json({ error: 'invalid or missing API key' });
}

module.exports = { requireApiKey };
