const express = require('express');
const { createWaste, createWasteFromBatch, getWasteById, getWastes } = require('../controllers/waste.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin', 'contador', 'bodega'));
router.route('/').get(getWastes).post(createWaste);
router.post('/from-batch', createWasteFromBatch);
router.get('/:id', getWasteById);

module.exports = router;
