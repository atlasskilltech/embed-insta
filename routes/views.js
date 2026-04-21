const express = require('express');
const { feed, postDetail, embed } = require('../controllers/viewController');

const router = express.Router();

router.get('/', feed);
router.get('/post/:postId', postDetail);
router.get('/embed/:postId', embed);

module.exports = router;
