const mongoose = require('mongoose');
const InventoryMovement = require('../models/InventoryMovement');
const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const Waste = require('../models/Waste');
const { createAuditLog } = require('../utils/auditLogger');
const { paginatedResponse } = require('../utils/pagination');
const { applyDateRange, escapeRegex } = require('../utils/queryFilters');

const getWastes = async (req, res) => {
  try {
    const { reason, product, search } = req.query;
    const filter = {};
    if (reason) filter.reason = reason;
    if (product) filter.product = product;
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ batchNumber: regex }, { description: regex }, { reason: regex }];
    }
    applyDateRange(filter, req.query);
    return res.json(await paginatedResponse(Waste, { filter, query: req.query, sortDefault: { createdAt: -1 }, populate: ['product', 'batch', 'createdBy'] }));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando mermas.', error: error.message });
  }
};

const createWaste = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { product: productId, batch: batchId, quantity, reason, description } = req.body;
    const wasteQuantity = Number(quantity);
    if (!productId || !reason || !wasteQuantity || wasteQuantity <= 0) {
      return res.status(400).json({ message: 'Producto, razon y cantidad mayor a 0 son obligatorios.' });
    }

    let waste;
    await session.withTransaction(async () => {
      const product = await Product.findById(productId).session(session);
      if (!product) throw Object.assign(new Error('Producto no encontrado.'), { statusCode: 404 });
      if (Number(product.stock || 0) < wasteQuantity) throw Object.assign(new Error('Stock insuficiente para registrar la merma.'), { statusCode: 400 });

      let batch = null;
      let unitCost = Number(product.unitCost || 0);
      if (batchId) {
        batch = await ProductBatch.findById(batchId).session(session);
        if (!batch || batch.product.toString() !== product._id.toString()) throw Object.assign(new Error('Lote no encontrado para el producto seleccionado.'), { statusCode: 404 });
        if (Number(batch.availableQuantity || 0) < wasteQuantity) throw Object.assign(new Error('Cantidad disponible insuficiente en el lote.'), { statusCode: 400 });
        batch.availableQuantity = Number(batch.availableQuantity || 0) - wasteQuantity;
        batch.updateStatus();
        unitCost = Number(batch.unitCost || unitCost);
        await batch.save({ session });
      }

      const previousStock = Number(product.stock || 0);
      product.stock = previousStock - wasteQuantity;
      product.updateInventoryStatus();
      await product.save({ session });

      const created = await Waste.create(
        [
          {
            product: product._id,
            batch: batch?._id,
            batchNumber: batch?.batchNumber,
            quantity: wasteQuantity,
            reason,
            unitCost,
            totalCost: unitCost * wasteQuantity,
            description,
            createdBy: req.user?._id
          }
        ],
        { session }
      );
      waste = created[0];

      await InventoryMovement.create(
        [
          {
            product: product._id,
            type: 'merma',
            quantity: -wasteQuantity,
            unitCost,
            previousStock,
            newStock: product.stock,
            referenceType: 'Waste',
            referenceId: waste._id.toString(),
            batch: batch?._id,
            batchNumber: batch?.batchNumber,
            description: `Merma por ${reason}`,
            user: req.user?._id
          }
        ],
        { session }
      );
    });

    const populated = await Waste.findById(waste._id).populate('product').populate('batch').populate('createdBy', 'name email role');
    await createAuditLog({ req, action: 'CREATE', module: 'wastes', entityId: populated._id, entityType: 'Waste', description: `Merma registrada por ${populated.reason}`, after: populated.toObject() });
    return res.status(201).json(populated);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error registrando merma.', error: error.message });
  } finally {
    await session.endSession();
  }
};

const createWasteFromBatch = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { batchId, quantity, reason = 'vencimiento', description } = req.body;
    const wasteQuantity = Number(quantity);
    if (!batchId) return res.status(400).json({ message: 'Debe seleccionar un lote.', field: 'batchId' });
    if (!wasteQuantity || wasteQuantity <= 0) return res.status(400).json({ message: 'La cantidad debe ser mayor que cero.', field: 'quantity' });

    let waste;
    let updatedBatch;
    let updatedProduct;

    await session.withTransaction(async () => {
      const batch = await ProductBatch.findById(batchId).session(session);
      if (!batch) throw Object.assign(new Error('Lote no encontrado.'), { statusCode: 404 });
      if (Number(batch.availableQuantity || 0) < wasteQuantity) throw Object.assign(new Error('Cantidad disponible insuficiente en el lote.'), { statusCode: 400 });

      const product = await Product.findById(batch.product).session(session);
      if (!product) throw Object.assign(new Error('Producto asociado al lote no encontrado.'), { statusCode: 404 });
      if (Number(product.stock || 0) < wasteQuantity) throw Object.assign(new Error('Stock insuficiente en el producto para registrar la merma.'), { statusCode: 400 });

      const previousStock = Number(product.stock || 0);
      const unitCost = Number(batch.unitCost || product.unitCost || 0);

      batch.availableQuantity = Number(batch.availableQuantity || 0) - wasteQuantity;
      batch.updateStatus();
      updatedBatch = await batch.save({ session });

      product.stock = previousStock - wasteQuantity;
      product.updateInventoryStatus();
      updatedProduct = await product.save({ session });

      const created = await Waste.create(
        [
          {
            product: product._id,
            batch: batch._id,
            batchNumber: batch.batchNumber,
            quantity: wasteQuantity,
            reason,
            unitCost,
            totalCost: unitCost * wasteQuantity,
            description,
            createdBy: req.user?._id
          }
        ],
        { session }
      );
      waste = created[0];

      await InventoryMovement.create(
        [
          {
            product: product._id,
            type: 'merma',
            quantity: -wasteQuantity,
            unitCost,
            previousStock,
            newStock: product.stock,
            referenceType: 'Waste',
            referenceId: waste._id.toString(),
            batch: batch._id,
            batchNumber: batch.batchNumber,
            description: `Merma desde lote por ${reason}`,
            user: req.user?._id
          }
        ],
        { session }
      );
    });

    const populated = await Waste.findById(waste._id).populate('product').populate('batch').populate('createdBy', 'name email role');
    await createAuditLog({
      req,
      action: 'CREATE',
      module: 'wastes',
      entityId: populated._id,
      entityType: 'Waste',
      description: `Merma registrada desde lote ${populated.batchNumber} por ${populated.reason}`,
      after: populated.toObject(),
      metadata: { batchStatus: updatedBatch?.status, productStock: updatedProduct?.stock }
    });
    return res.status(201).json(populated);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error registrando merma desde lote.', error: error.message });
  } finally {
    await session.endSession();
  }
};

const getWasteById = async (req, res) => {
  try {
    const waste = await Waste.findById(req.params.id).populate('product').populate('batch').populate('createdBy', 'name email role');
    if (!waste) return res.status(404).json({ message: 'Merma no encontrada.' });
    return res.json(waste);
  } catch (error) {
    return res.status(400).json({ message: 'Error consultando merma.', error: error.message });
  }
};

module.exports = { createWaste, createWasteFromBatch, getWasteById, getWastes };
