const express = require('express');
const { search } = require('../controllers/search.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', protect, search);

module.exports = router;
