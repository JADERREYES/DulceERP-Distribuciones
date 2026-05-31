const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const { paginatedResponse } = require('../utils/pagination');

const refreshStatuses = async (batches) => {
  for (const batch of batches) {
    batch.updateStatus();
  }
  return batches;
};

const buildFilter = async (query) => {
  const { product, status, from, to, search } = query;
  const filter = {};
  if (product) filter.product = product;
  if (status) filter.status = status;
  if (from || to) {
    filter.expirationDate = {};
    if (from) filter.expirationDate.$gte = new Date(from);
    if (to) filter.expirationDate.$lte = new Date(to);
  }
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const products = await Product.find({ $or: [{ name: regex }, { sku: regex }, { category: regex }] }).select('_id');
    filter.$or = [{ batchNumber: regex }, { product: { $in: products.map((item) => item._id) } }];
  }
  return filter;
};

const getBatches = async (req, res) => {
  try {
    const filter = await buildFilter(req.query);
    const response = await paginatedResponse(ProductBatch, {
      filter,
      query: req.query,
      sortDefault: { expirationDate: 1 },
      populate: ['product', 'supplier', 'purchase']
    });
    response.data = await refreshStatuses(response.data);
    return res.json(response);
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando lotes.', error: error.message });
  }
};

const getBatchesByProduct = async (req, res) => {
  try {
    const batches = await ProductBatch.find({ product: req.params.productId })
      .populate('product')
      .populate('supplier')
      .sort({ expirationDate: 1 });
    return res.json(await refreshStatuses(batches));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando lotes del producto.', error: error.message });
  }
};

const getExpiringBatches = async (req, res) => {
  try {
    const now = new Date();
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    const batches = await ProductBatch.find({ availableQuantity: { $gt: 0 }, expirationDate: { $gte: now, $lte: limit } })
      .populate('product')
      .populate('supplier')
      .sort({ expirationDate: 1 });
    return res.json(await refreshStatuses(batches));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando lotes proximos a vencer.', error: error.message });
  }
};

const getExpiredBatches = async (req, res) => {
  try {
    const now = new Date();
    const batches = await ProductBatch.find({ availableQuantity: { $gt: 0 }, expirationDate: { $lt: now } })
      .populate('product')
      .populate('supplier')
      .sort({ expirationDate: 1 });
    return res.json(await refreshStatuses(batches));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando lotes vencidos.', error: error.message });
  }
};

module.exports = { getBatches, getBatchesByProduct, getExpiredBatches, getExpiringBatches };
