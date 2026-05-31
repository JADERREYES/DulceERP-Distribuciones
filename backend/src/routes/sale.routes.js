const express = require('express');
const { cancelSale, createSale, getSaleById, getSales, validateSale } = require('../controllers/sale.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect);
router.route('/').get(authorizeRoles('admin', 'contador', 'vendedor', 'cartera'), getSales).post(authorizeRoles('admin', 'vendedor'), createSale);
router.post('/validate', authorizeRoles('admin', 'vendedor'), validateSale);
router.patch('/:id/cancel', authorizeRoles('admin', 'contador'), cancelSale);
router.route('/:id').get(authorizeRoles('admin', 'contador', 'vendedor', 'cartera'), getSaleById);

module.exports = router;
