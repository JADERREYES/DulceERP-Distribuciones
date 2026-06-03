const express = require('express');
const {
  createProduct,
  deleteProduct,
  getProductById,
  getProductSaleAvailabilityController,
  getProducts,
  updateProduct
} = require('../controllers/product.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect);
router.route('/').get(authorizeRoles('admin', 'contador', 'vendedor', 'bodega'), getProducts).post(authorizeRoles('admin', 'bodega'), createProduct);
router.get('/:id/sale-availability', authorizeRoles('admin', 'contador', 'vendedor', 'bodega'), getProductSaleAvailabilityController);
router
  .route('/:id')
  .get(authorizeRoles('admin', 'contador', 'vendedor', 'bodega'), getProductById)
  .put(authorizeRoles('admin', 'bodega'), updateProduct)
  .delete(authorizeRoles('admin'), deleteProduct);

module.exports = router;
