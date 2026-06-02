const CostHistory = require('../models/CostHistory');
const InventoryMovement = require('../models/InventoryMovement');
const { paginatedResponse } = require('../utils/pagination');
const { applyDateRange, escapeRegex } = require('../utils/queryFilters');

const getKardex = async (req, res) => {
  try {
    const { product, type, referenceType, batch, reference } = req.query;
    const filter = {};
    if (product) filter.product = product;
    if (type) filter.type = type;
    if (referenceType) filter.referenceType = referenceType;
    if (batch) filter.batch = batch;
    if (reference) {
      const regex = new RegExp(escapeRegex(reference), 'i');
      filter.$or = [{ referenceId: regex }, { referenceType: regex }, { batchNumber: regex }, { description: regex }];
    }
    applyDateRange(filter, req.query);
    return res.json(await paginatedResponse(InventoryMovement, { filter, query: req.query, sortDefault: { createdAt: -1 }, populate: ['product', 'batch', 'user'] }));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando kardex.', error: error.message });
  }
};

const getCostHistory = async (req, res) => {
  try {
    const filter = {};
    if (req.query.product) filter.product = req.query.product;
    applyDateRange(filter, req.query);
    return res.json(await paginatedResponse(CostHistory, { filter, query: req.query, sortDefault: { createdAt: -1 }, populate: ['product', 'supplier', 'purchase'] }));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando costos historicos.', error: error.message });
  }
};

module.exports = { getKardex, getCostHistory };
