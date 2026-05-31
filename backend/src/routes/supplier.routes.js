const express = require('express');
const { createSupplier, deleteSupplier, getSuppliers, updateSupplier } = require('../controllers/supplier.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect);
router.route('/').get(authorizeRoles('admin', 'contador', 'bodega'), getSuppliers).post(authorizeRoles('admin', 'contador'), createSupplier);
router.route('/:id').put(authorizeRoles('admin', 'contador'), updateSupplier).delete(authorizeRoles('admin'), deleteSupplier);

module.exports = router;
