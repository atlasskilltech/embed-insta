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
router.post('/settings', requireAdmin, admin.settingsSubmit);
router.post('/fetch', requireAdmin, admin.fetchNow);

module.exports = router;
