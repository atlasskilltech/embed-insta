const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const apiRoutes = require('./routes/api');
const viewRoutes = require('./routes/views');
const scheduler = require('./jobs/scheduler');

fs.mkdirSync(config.media.absDir, { recursive: true });

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.use(config.media.urlPrefix, express.static(config.media.absDir, { maxAge: '7d' }));

app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use('/api', apiRoutes);
app.use('/', viewRoutes);

app.use((_req, res) => res.status(404).render('404', { title: 'Not found' }));

app.use((err, _req, res, _next) => {
  console.error('[server] error:', err);
  res.status(500).json({ ok: false, error: err.message });
});

const server = app.listen(config.port, () => {
  console.log(`[server] listening on ${config.baseUrl}`);
  scheduler.start();
});

function shutdown() {
  console.log('[server] shutting down');
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
