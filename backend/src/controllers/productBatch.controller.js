const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const { createAuditLog } = require('../utils/auditLogger');
const { updateBatchStatus } = require('../utils/batchStatus');
const { paginatedResponse } = require('../utils/pagination');

const refreshStatuses = async (batches) => {
  for (const batch of batches) {
    batch.updateStatus();
  }
  return batches;
};

const buildFilter = async (query) => {
  const { product, status, supplier, from, to, search } = query;
  const filter = {};
  if (product) filter.product = product;
  if (status) filter.status = status;
  if (supplier) filter.supplier = supplier;
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

const mapExpiredBatch = (batch) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiration = new Date(batch.expirationDate);
  expiration.setHours(0, 0, 0, 0);
  const daysExpired = Math.max(Math.floor((today - expiration) / 86400000), 0);
  return {
    _id: batch._id,
    batchNumber: batch.batchNumber,
    product: batch.product,
    productName: batch.product?.name,
    sku: batch.product?.sku,
    availableQuantity: batch.availableQuantity,
    unitCost: batch.unitCost,
    totalCost: Number(batch.availableQuantity || 0) * Number(batch.unitCost || 0),
    expirationDate: batch.expirationDate,
    daysExpired,
    supplier: batch.supplier,
    purchase: batch.purchase,
    status: batch.status
  };
};

const getExpiredBatchesWithStock = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const batches = await ProductBatch.find({ availableQuantity: { $gt: 0 }, expirationDate: { $lt: today } })
      .populate('product', 'name sku category stock')
      .populate('supplier', 'name document')
      .populate('purchase', 'invoiceNumber createdAt')
      .sort({ expirationDate: 1 });
    return res.json(batches.map(mapExpiredBatch));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando lotes vencidos con stock.', error: error.message });
  }
};

const blockBatch = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'Debe indicar la razon para bloquear el lote.', field: 'reason' });
    }

    const batch = await ProductBatch.findById(req.params.id).populate('product', 'name sku');
    if (!batch) return res.status(404).json({ message: 'Lote no encontrado.' });

    const before = batch.toObject();
    batch.status = 'bloqueado';
    batch.notes = [batch.notes, `Bloqueado: ${reason}`].filter(Boolean).join(' | ');
    await batch.save();

    await createAuditLog({
      req,
      action: 'STATUS_CHANGE',
      module: 'batches',
      entityId: batch._id,
      entityType: 'ProductBatch',
      description: `Lote bloqueado: ${batch.batchNumber}`,
      before,
      after: batch.toObject(),
      metadata: { reason }
    });

    return res.json(batch);
  } catch (error) {
    return res.status(400).json({ message: 'Error bloqueando lote.', error: error.message });
  }
};

const updateExpirationDate = async (req, res) => {
  try {
    const { expirationDate, reason } = req.body;
    if (!expirationDate) return res.status(400).json({ message: 'La nueva fecha de vencimiento es obligatoria.', field: 'expirationDate' });
    if (!reason || !String(reason).trim()) return res.status(400).json({ message: 'Debe indicar la razon de la correccion.', field: 'reason' });

    const parsedDate = new Date(expirationDate);
    if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ message: 'Fecha de vencimiento invalida.', field: 'expirationDate' });

    const batch = await ProductBatch.findById(req.params.id).populate('product', 'name sku');
    if (!batch) return res.status(404).json({ message: 'Lote no encontrado.' });

    const before = batch.toObject();
    batch.expirationDate = parsedDate;
    if (batch.status === 'bloqueado') {
      batch.status = 'disponible';
    }
    updateBatchStatus(batch);
    batch.notes = [batch.notes, `Correccion vencimiento: ${reason}`].filter(Boolean).join(' | ');
    await batch.save();

    await createAuditLog({
      req,
      action: 'UPDATE',
      module: 'batches',
      entityId: batch._id,
      entityType: 'ProductBatch',
      description: `Fecha de vencimiento corregida para lote ${batch.batchNumber}`,
      before,
      after: batch.toObject(),
      metadata: { reason, expirationDate }
    });

    return res.json(batch);
  } catch (error) {
    return res.status(400).json({ message: 'Error corrigiendo vencimiento del lote.', error: error.message });
  }
};

module.exports = {
  blockBatch,
  getBatches,
  getBatchesByProduct,
  getExpiredBatches,
  getExpiredBatchesWithStock,
  getExpiringBatches,
  updateExpirationDate
};
