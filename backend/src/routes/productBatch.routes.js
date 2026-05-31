const express = require('express');
const { getBatches, getBatchesByProduct, getExpiredBatches, getExpiringBatches } = require('../controllers/productBatch.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin', 'contador', 'bodega'));
router.get('/', getBatches);
router.get('/expiring', getExpiringBatches);
router.get('/expired', getExpiredBatches);
router.get('/product/:productId', getBatchesByProduct);

module.exports = router;
