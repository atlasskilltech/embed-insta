const express = require('express');
const { feed, postDetail, embed, embedFeed } = require('../controllers/viewController');

const router = express.Router();

router.get('/', feed);
router.get('/post/:postId', postDetail);
router.get('/embed/feed', embedFeed);
router.get('/embed/feed/:slug', embedFeed);
router.get('/embed/:postId', embed);

module.exports = router;
