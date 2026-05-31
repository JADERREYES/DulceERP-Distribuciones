const express = require('express');
const {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  getCustomerDebtDetail,
  getCustomers,
  updateCustomer
} = require('../controllers/customer.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect);
router.route('/').get(authorizeRoles('admin', 'contador', 'vendedor', 'cartera'), getCustomers).post(authorizeRoles('admin', 'vendedor', 'cartera'), createCustomer);
router.get('/:id/debt-detail', authorizeRoles('admin', 'contador', 'vendedor', 'cartera'), getCustomerDebtDetail);
router
  .route('/:id')
  .get(authorizeRoles('admin', 'contador', 'vendedor', 'cartera'), getCustomerById)
  .put(authorizeRoles('admin', 'vendedor', 'cartera'), updateCustomer)
  .delete(authorizeRoles('admin'), deleteCustomer);

module.exports = router;
