const express = require('express');
const { fetchNow, list, get, embedJson } = require('../controllers/apiController');
const { requireApiKey } = require('../middleware/auth');

const router = express.Router();

router.post('/instagram/fetch', requireApiKey, fetchNow);
router.get('/instagram/posts', list);
router.get('/instagram/post/:postId', get);
router.get('/instagram/embed/:postId', embedJson);

module.exports = router;
