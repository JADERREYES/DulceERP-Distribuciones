const express = require('express');
const { login, profile, register } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.post('/login', login);
router.post('/register', protect, authorizeRoles('admin'), register);
router.get('/profile', protect, profile);

module.exports = router;
