const express = require('express');
const { feed, postDetail, embed, embedFeed } = require('../controllers/viewController');
const { mediaProxy } = require('../controllers/proxyController');

const router = express.Router();

router.get('/', feed);
router.get('/post/:postId', postDetail);
router.get('/proxy/media/:postId/:position/:variant(thumb)', mediaProxy);
router.get('/proxy/media/:postId/:position', mediaProxy);
router.get('/embed/feed', embedFeed);
router.get('/embed/feed/:slug', embedFeed);
router.get('/embed/:postId', embed);

module.exports = router;
