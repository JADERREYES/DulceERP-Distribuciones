const mongoose = require('mongoose');
const CostHistory = require('../models/CostHistory');
const InventoryMovement = require('../models/InventoryMovement');
const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const Purchase = require('../models/Purchase');
const Supplier = require('../models/Supplier');
const { createAuditLog } = require('../utils/auditLogger');
const { paginatedResponse } = require('../utils/pagination');

const buildBatchNumber = (sku) => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `LOTE-${sku || 'SKU'}-${date}-${suffix}`;
};

const getPurchases = async (req, res) => {
  try {
    const { search, status, paymentMethod, paymentStatus } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const suppliers = await Supplier.find({ $or: [{ name: regex }, { document: regex }] }).select('_id');
      filter.$or = [{ invoiceNumber: regex }, { supplier: { $in: suppliers.map((supplier) => supplier._id) } }];
      if (mongoose.Types.ObjectId.isValid(search)) filter.$or.push({ _id: search });
    }
    return res.json(await paginatedResponse(Purchase, { filter, query: req.query, sortDefault: { createdAt: -1 }, populate: ['supplier', 'items.product', 'createdBy'] }));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando compras.', error: error.message });
  }
};

const createPurchase = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { supplier: supplierId, items, paymentMethod, invoiceNumber, note } = req.body;
    if (!supplierId || !Array.isArray(items) || items.length === 0 || !paymentMethod) {
      return res.status(400).json({ message: 'Proveedor, productos y forma de pago son obligatorios.' });
    }
    if (!['contado', 'credito'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Forma de pago invalida.' });
    }

    let createdPurchase;

    await session.withTransaction(async () => {
      const supplier = await Supplier.findById(supplierId).session(session);
      if (!supplier) throw Object.assign(new Error('Proveedor no encontrado.'), { statusCode: 404 });

      const purchaseItems = [];
      const pendingBatches = [];
      const pendingCosts = [];
      let total = 0;

      for (const item of items) {
        const product = await Product.findById(item.product).session(session);
        if (!product) throw Object.assign(new Error(`Producto no encontrado: ${item.product}`), { statusCode: 404 });
        const quantity = Number(item.quantity);
        const unitCost = Number(item.unitCost);
        if (!quantity || quantity < 1 || !unitCost || unitCost <= 0) {
          throw Object.assign(new Error(`Cantidad o costo invalido para ${product.name}.`), { statusCode: 400 });
        }
        if (!item.expirationDate) {
          throw Object.assign(new Error('La fecha de vencimiento del lote es obligatoria.'), { statusCode: 400 });
        }
        const expirationDate = new Date(item.expirationDate);
        if (Number.isNaN(expirationDate.getTime())) {
          throw Object.assign(new Error(`Fecha de vencimiento invalida para ${product.name}.`), { statusCode: 400 });
        }
        const batchNumber = item.batchNumber?.trim() || buildBatchNumber(product.sku);

        const previousStock = Number(product.stock || 0);
        const previousCost = Number(product.unitCost || 0);
        const subtotal = quantity * unitCost;
        const newStock = previousStock + quantity;
        const weightedCost = previousStock <= 0 ? unitCost : ((previousStock * previousCost) + subtotal) / newStock;
        if (!Number.isFinite(weightedCost) || weightedCost < 0) {
          throw Object.assign(new Error(`Costo promedio invalido para ${product.name}.`), { statusCode: 400 });
        }

        product.stock = newStock;
        product.unitCost = Number(weightedCost.toFixed(2));
        product.updateInventoryStatus();
        await product.save({ session });

        purchaseItems.push({ product: product._id, quantity, unitCost, previousUnitCost: previousCost, subtotal, batchNumber, expirationDate });
        total += subtotal;

        pendingBatches.push({ product: product._id, supplier: supplier._id, batchNumber, initialQuantity: quantity, availableQuantity: quantity, unitCost, expirationDate, previousStock, newStock });
        if (previousCost !== product.unitCost) {
          pendingCosts.push({ product: product._id, supplier: supplier._id, previousCost, newCost: product.unitCost, changeType: 'purchase_average_cost', quantity, note: 'Costo promedio actualizado por compra', user: req.user?._id });
        }
      }

      if (paymentMethod === 'credito') {
        supplier.currentDebt = Number(supplier.currentDebt || 0) + total;
        supplier.updatePayableStatus();
        await supplier.save({ session });
      }

      const purchase = await Purchase.create([{ supplier: supplier._id, items: purchaseItems, total, paymentMethod, paymentStatus: paymentMethod === 'credito' ? 'pendiente' : 'pagado', paidAmount: paymentMethod === 'credito' ? 0 : total, balance: paymentMethod === 'credito' ? total : 0, invoiceNumber, note, createdBy: req.user?._id }], { session });
      createdPurchase = purchase[0];

      for (const pendingBatch of pendingBatches) {
        const createdBatch = await ProductBatch.create(
          [
            {
              product: pendingBatch.product,
              supplier: pendingBatch.supplier,
              purchase: createdPurchase._id,
              batchNumber: pendingBatch.batchNumber,
              initialQuantity: pendingBatch.initialQuantity,
              availableQuantity: pendingBatch.availableQuantity,
              unitCost: pendingBatch.unitCost,
              expirationDate: pendingBatch.expirationDate
            }
          ],
          { session }
        );
        await InventoryMovement.create(
          [
            {
              product: pendingBatch.product,
              type: 'entrada_compra',
              quantity: pendingBatch.initialQuantity,
              unitCost: pendingBatch.unitCost,
              previousStock: pendingBatch.previousStock,
              newStock: pendingBatch.newStock,
              referenceType: 'Purchase',
              referenceId: createdPurchase._id.toString(),
              batch: createdBatch[0]._id,
              batchNumber: createdBatch[0].batchNumber,
              description: 'Entrada por compra con lote',
              user: req.user?._id
            }
          ],
          { session }
        );
      }
      if (pendingCosts.length > 0) {
        await CostHistory.create(pendingCosts.map((cost) => ({ ...cost, purchase: createdPurchase._id })), { session });
      }
    });

    const populated = await Purchase.findById(createdPurchase._id).populate('supplier').populate('items.product').populate('createdBy', 'name email role');
    await createAuditLog({ req, action: 'CREATE', module: 'purchases', entityId: populated._id, entityType: 'Purchase', description: `Compra creada por valor de $${Number(populated.total).toLocaleString('es-CO')}`, after: populated.toObject() });
    await createAuditLog({ req, action: 'CREATE', module: 'batches', entityId: populated._id, entityType: 'Purchase', description: 'Lotes creados por compra', metadata: { purchase: populated._id, batches: populated.items.map((item) => item.batchNumber).filter(Boolean) } });
    return res.status(201).json(populated);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error registrando compra.', error: error.message });
  } finally {
    await session.endSession();
  }
};

const cancelPurchase = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let canceledPurchase;
    await session.withTransaction(async () => {
      const purchase = await Purchase.findById(req.params.id).session(session);
      if (!purchase) throw Object.assign(new Error('Compra no encontrada.'), { statusCode: 404 });
      if (purchase.status === 'anulada') throw Object.assign(new Error('La compra ya esta anulada.'), { statusCode: 400 });

      for (const item of purchase.items) {
        const product = await Product.findById(item.product).session(session);
        if (!product) continue;
        if (product.stock < item.quantity) throw Object.assign(new Error('No se puede anular la compra porque parte del inventario ya fue vendido o consumido.'), { statusCode: 400 });
        const batch = await ProductBatch.findOne({ purchase: purchase._id, product: product._id, batchNumber: item.batchNumber }).session(session);
        if (batch && Number(batch.availableQuantity || 0) < Number(item.quantity || 0)) {
          throw Object.assign(new Error('No se puede anular la compra porque parte del inventario ya fue vendido o consumido.'), { statusCode: 400 });
        }
        const previousStock = product.stock;
        product.stock -= item.quantity;
        product.updateInventoryStatus();
        await product.save({ session });
        if (batch) {
          batch.availableQuantity = Number(batch.availableQuantity || 0) - Number(item.quantity || 0);
          batch.updateStatus();
          await batch.save({ session });
        }
        await InventoryMovement.create([{ product: product._id, type: 'anulacion_compra', quantity: -item.quantity, unitCost: item.unitCost, previousStock, newStock: product.stock, referenceType: 'Purchase', referenceId: purchase._id.toString(), batch: batch?._id, batchNumber: batch?.batchNumber || item.batchNumber, description: 'Anulacion de compra', user: req.user?._id }], { session });
        await CostHistory.create([{ product: product._id, supplier: purchase.supplier, purchase: purchase._id, previousCost: product.unitCost, newCost: product.unitCost, changeType: 'purchase_cancel_note', quantity: item.quantity, note: 'Compra anulada. No se recalcula costo promedio por seguridad contable.', user: req.user?._id }], { session });
      }

      if (purchase.paymentMethod === 'credito' && purchase.paymentStatus === 'pendiente') {
        const supplier = await Supplier.findById(purchase.supplier).session(session);
        if (supplier) {
          supplier.currentDebt = Math.max(Number(supplier.currentDebt || 0) - Number(purchase.balance || 0), 0);
          supplier.updatePayableStatus();
          await supplier.save({ session });
        }
      }

      purchase.status = 'anulada';
      purchase.balance = 0;
      canceledPurchase = await purchase.save({ session });
    });
    const populated = await Purchase.findById(canceledPurchase._id).populate('supplier').populate('items.product');
    await createAuditLog({ req, action: 'CANCEL', module: 'purchases', entityId: populated._id, entityType: 'Purchase', description: 'Compra anulada y stock reversado', after: populated.toObject() });
    return res.json(populated);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error anulando compra.', error: error.message });
  } finally {
    await session.endSession();
  }
};

module.exports = { getPurchases, createPurchase, cancelPurchase };
