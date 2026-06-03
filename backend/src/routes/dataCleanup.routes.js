const express = require('express');
const {
  createInitialBatch,
  deleteDemoApply,
  deleteDemoPreview,
  demoCleanupPreview,
  detectDemo,
  markDemo,
  productsWithoutBatches,
  realReadiness,
  resetOperationalApply,
  resetOperationalPreview
} = require('../controllers/dataCleanup.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect);
router.get('/real-readiness', authorizeRoles('admin'), realReadiness);
router.get('/detect-demo', authorizeRoles('admin'), detectDemo);
router.post('/mark-demo', authorizeRoles('admin'), markDemo);
router.post('/demo-cleanup-preview', authorizeRoles('admin'), demoCleanupPreview);
router.post('/delete-demo-preview', authorizeRoles('admin'), deleteDemoPreview);
router.post('/delete-demo-apply', authorizeRoles('admin'), deleteDemoApply);
router.post('/reset-operational-preview', authorizeRoles('admin'), resetOperationalPreview);
router.post('/reset-operational-apply', authorizeRoles('admin'), resetOperationalApply);
router.get('/products-without-batches', authorizeRoles('admin', 'bodega'), productsWithoutBatches);
router.post('/create-initial-batch', authorizeRoles('admin', 'bodega'), createInitialBatch);

module.exports = router;
