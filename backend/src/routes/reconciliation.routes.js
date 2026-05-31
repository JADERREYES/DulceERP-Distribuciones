const express = require('express');
const { financial, financialDetails, inventory, repairApply, repairPreview } = require('../controllers/reconciliation.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.get('/inventory', protect, authorizeRoles('admin', 'contador', 'bodega'), inventory);
router.get('/financial', protect, authorizeRoles('admin', 'contador'), financial);
router.get('/financial/details', protect, authorizeRoles('admin', 'contador'), financialDetails);
router.post('/financial/repair-preview', protect, authorizeRoles('admin', 'contador'), repairPreview);
router.post('/financial/repair-apply', protect, authorizeRoles('admin'), repairApply);

module.exports = router;
