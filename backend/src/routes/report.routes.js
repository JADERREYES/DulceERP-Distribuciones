const express = require('express');
const { inventoryRisk, receivables } = require('../controllers/report.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin', 'contador'));
router.get('/receivables', receivables);
router.get('/inventory-risk', inventoryRisk);

module.exports = router;
