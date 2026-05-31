const express = require('express');
const { createPayment, getPayments, getPaymentsByCustomer } = require('../controllers/payment.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect);
router.route('/').get(authorizeRoles('admin', 'contador', 'cartera'), getPayments).post(authorizeRoles('admin', 'contador', 'cartera'), createPayment);
router.get('/customer/:customerId', authorizeRoles('admin', 'contador', 'cartera'), getPaymentsByCustomer);

module.exports = router;
