const express = require('express');
const { createSupplierPayment, getSupplierPayments } = require('../controllers/supplierPayment.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect);
router.route('/').get(authorizeRoles('admin', 'contador'), getSupplierPayments).post(authorizeRoles('admin', 'contador'), createSupplierPayment);

module.exports = router;
