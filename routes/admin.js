const express = require('express');
const admin = require('../controllers/adminController');
const { requireAdmin, redirectIfAuthed } = require('../middleware/auth');

const router = express.Router();

router.get('/login', redirectIfAuthed, admin.loginPage);
router.post('/login', redirectIfAuthed, admin.loginSubmit);
router.post('/logout', admin.logout);
router.get('/logout', admin.logout);

router.get('/', requireAdmin, admin.dashboard);
router.get('/settings', requireAdmin, admin.settingsPage);

router.get('/widgets', requireAdmin, admin.widgetsList);
router.get('/widgets/new', requireAdmin, admin.widgetNewPage);
router.post('/widgets', requireAdmin, admin.widgetCreate);
router.get('/widgets/:slug', requireAdmin, admin.widgetEditPage);
router.post('/widgets/:slug', requireAdmin, admin.widgetUpdate);
router.post('/widgets/:slug/delete', requireAdmin, admin.widgetDelete);

router.post('/fetch', requireAdmin, admin.fetchNow);
router.post('/media/redownload', requireAdmin, admin.redownloadMissingMedia);

router.get('/graph', requireAdmin, admin.graphAccountsList);
router.get('/graph/new', requireAdmin, admin.graphAccountNewPage);
router.post('/graph', requireAdmin, admin.graphAccountCreate);
router.post('/graph/fetch', requireAdmin, admin.graphFetchNow);
router.get('/graph/:id', requireAdmin, admin.graphAccountEditPage);
router.post('/graph/:id', requireAdmin, admin.graphAccountUpdate);
router.post('/graph/:id/fetch', requireAdmin, admin.graphFetchNow);
router.post('/graph/:id/delete', requireAdmin, admin.graphAccountDelete);

module.exports = router;
