const express = require('express');
const { getCostHistory, getKardex } = require('../controllers/kardex.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin', 'contador', 'bodega'));
router.get('/', getKardex);
router.get('/cost-history', getCostHistory);

module.exports = router;
