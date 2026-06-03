const express = require('express');
const { cancelSale, createSale, getSaleById, getSales, validateSale } = require('../controllers/sale.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

const authorizeSaleCreate = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'No autorizado. Usuario requerido.' });
  if (!['admin', 'vendedor'].includes(req.user.role)) {
    return res.status(403).json({ message: 'No tienes permisos para registrar ventas.' });
  }
  return next();
};

router.use(protect);
router.post('/validate', authorizeSaleCreate, validateSale);
router.route('/').get(authorizeRoles('admin', 'contador', 'vendedor', 'cartera'), getSales).post(authorizeSaleCreate, createSale);
router.patch('/:id/cancel', authorizeRoles('admin', 'contador'), cancelSale);
router.route('/:id').get(authorizeRoles('admin', 'contador', 'vendedor', 'cartera'), getSaleById);

module.exports = router;
