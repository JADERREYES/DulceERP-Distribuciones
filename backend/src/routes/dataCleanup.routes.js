const express = require('express');
const {
  createInitialBatch,
  deleteDemoApply,
  deleteDemoPreview,
  detectDemo,
  markDemo,
  productsWithoutBatches
} = require('../controllers/dataCleanup.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect);
router.get('/detect-demo', authorizeRoles('admin'), detectDemo);
router.post('/mark-demo', authorizeRoles('admin'), markDemo);
router.post('/delete-demo-preview', authorizeRoles('admin'), deleteDemoPreview);
router.post('/delete-demo-apply', authorizeRoles('admin'), deleteDemoApply);
router.get('/products-without-batches', authorizeRoles('admin', 'bodega'), productsWithoutBatches);
router.post('/create-initial-batch', authorizeRoles('admin', 'bodega'), createInitialBatch);

module.exports = router;
