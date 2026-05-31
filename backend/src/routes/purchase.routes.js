const express = require('express');
const { cancelPurchase, createPurchase, getPurchases } = require('../controllers/purchase.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect);
router.route('/').get(authorizeRoles('admin', 'contador', 'bodega'), getPurchases).post(authorizeRoles('admin', 'contador', 'bodega'), createPurchase);
router.patch('/:id/cancel', authorizeRoles('admin', 'contador'), cancelPurchase);

module.exports = router;
