const express = require('express');
const {
  blockBatch,
  getBatches,
  getBatchesByProduct,
  getExpiredBatches,
  getExpiredBatchesWithStock,
  getExpiringBatches,
  updateExpirationDate
} = require('../controllers/productBatch.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin', 'contador', 'bodega'));
router.get('/', getBatches);
router.get('/expiring', getExpiringBatches);
router.get('/expired', getExpiredBatches);
router.get('/expired-with-stock', getExpiredBatchesWithStock);
router.get('/product/:productId', getBatchesByProduct);
router.patch('/:id/block', blockBatch);
router.patch('/:id/expiration-date', authorizeRoles('admin', 'bodega'), updateExpirationDate);

module.exports = router;
