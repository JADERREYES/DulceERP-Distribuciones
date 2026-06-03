const express = require('express');
const { cancelPurchase, createPurchase, getPurchases, validatePurchase } = require('../controllers/purchase.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

const authorizePurchaseCreate = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'No autorizado. Usuario requerido.' });
  if (!['admin', 'contador', 'bodega'].includes(req.user.role)) {
    return res.status(403).json({ message: 'No tienes permisos para registrar compras.' });
  }
  return next();
};

router.use(protect);
router.post('/validate', authorizePurchaseCreate, validatePurchase);
router.route('/').get(authorizeRoles('admin', 'contador', 'bodega'), getPurchases).post(authorizePurchaseCreate, createPurchase);
router.patch('/:id/cancel', authorizeRoles('admin', 'contador'), cancelPurchase);

module.exports = router;
