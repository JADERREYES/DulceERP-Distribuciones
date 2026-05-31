const express = require('express');
const { alerts, salesBreakdown, summary, trends } = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin', 'contador'));
router.get('/summary', summary);
router.get('/trends', trends);
router.get('/sales-breakdown', salesBreakdown);
router.get('/alerts', alerts);

module.exports = router;
