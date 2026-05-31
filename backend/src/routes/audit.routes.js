const express = require('express');
const { getAuditLogs } = require('../controllers/audit.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.get('/', protect, authorizeRoles('admin', 'contador'), getAuditLogs);

module.exports = router;
