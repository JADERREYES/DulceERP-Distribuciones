const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Expense = require('../models/Expense');
const InventoryMovement = require('../models/InventoryMovement');
const Payment = require('../models/Payment');
const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const Supplier = require('../models/Supplier');
const SupplierPayment = require('../models/SupplierPayment');
const Waste = require('../models/Waste');
const { createAuditLog } = require('../utils/auditLogger');

const demoRegex = /(auditoria|auditor[ií]a|prueba|test|demo|ejemplo|ficticio|audit|fc-aud)/i;

const collections = {
  products: { Model: Product, label: 'Producto', fields: ['name', 'sku', 'category'] },
  customers: { Model: Customer, label: 'Cliente', fields: ['name', 'document', 'email', 'phone', 'zone'] },
  suppliers: { Model: Supplier, label: 'Proveedor', fields: ['name', 'document', 'email', 'phone', 'contactName'] },
  sales: { Model: Sale, label: 'Venta', fields: ['routeZone'] },
  purchases: { Model: Purchase, label: 'Compra', fields: ['invoiceNumber', 'note'] },
  payments: { Model: Payment, label: 'Pago cliente', fields: ['note', 'paymentMethod'] },
  supplierPayments: { Model: SupplierPayment, label: 'Pago proveedor', fields: ['note', 'paymentMethod'] },
  expenses: { Model: Expense, label: 'Gasto', fields: ['concept', 'category', 'description'] },
  batches: { Model: ProductBatch, label: 'Lote', fields: ['batchNumber', 'notes'] },
  wastes: { Model: Waste, label: 'Merma', fields: ['batchNumber', 'reason', 'description'] }
};

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const itemName = (collection, doc) => {
  if (collection === 'sales') return `Venta ${doc._id}`;
  if (collection === 'payments') return `Pago ${doc._id}`;
  if (collection === 'supplierPayments') return `Pago proveedor ${doc._id}`;
  if (collection === 'purchases') return doc.invoiceNumber || `Compra ${doc._id}`;
  if (collection === 'batches') return doc.batchNumber || `Lote ${doc._id}`;
  if (collection === 'wastes') return doc.batchNumber || `Merma ${doc._id}`;
  return doc.name || doc.concept || doc._id.toString();
};

const reasonFor = (doc, fields) => {
  const matchedField = fields.find((field) => demoRegex.test(String(doc[field] || '')));
  return matchedField ? `Patron demo detectado en ${matchedField}: ${doc[matchedField]}` : 'Marcado como posible demo por patron.';
};

const relationSummary = async (collection, id) => {
  const objectId = new mongoose.Types.ObjectId(id);
  const counts = {};

  if (collection === 'products') {
    counts.sales = await Sale.countDocuments({ 'items.product': objectId });
    counts.purchases = await Purchase.countDocuments({ 'items.product': objectId });
    counts.batches = await ProductBatch.countDocuments({ product: objectId });
    counts.kardex = await InventoryMovement.countDocuments({ product: objectId });
    counts.wastes = await Waste.countDocuments({ product: objectId });
  } else if (collection === 'customers') {
    counts.sales = await Sale.countDocuments({ customer: objectId });
    counts.payments = await Payment.countDocuments({ customer: objectId });
  } else if (collection === 'suppliers') {
    counts.purchases = await Purchase.countDocuments({ supplier: objectId });
    counts.supplierPayments = await SupplierPayment.countDocuments({ supplier: objectId });
    counts.batches = await ProductBatch.countDocuments({ supplier: objectId });
  } else if (collection === 'sales') {
    counts.kardex = await InventoryMovement.countDocuments({ referenceType: 'Sale', referenceId: id.toString() });
  } else if (collection === 'purchases') {
    counts.batches = await ProductBatch.countDocuments({ purchase: objectId });
    counts.kardex = await InventoryMovement.countDocuments({ referenceType: 'Purchase', referenceId: id.toString() });
  } else if (collection === 'batches') {
    counts.kardex = await InventoryMovement.countDocuments({ batch: objectId });
    counts.wastes = await Waste.countDocuments({ batch: objectId });
  } else if (collection === 'wastes') {
    counts.kardex = await InventoryMovement.countDocuments({ referenceType: 'Waste', referenceId: id.toString() });
  }

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { counts, hasRelations: total > 0 };
};

const detectPossibleDemoRecords = async () => {
  const result = {};
  let totalPossibleDemoRecords = 0;

  for (const [collection, config] of Object.entries(collections)) {
    const conditions = config.fields.map((field) => ({ [field]: demoRegex }));
    const docs = await config.Model.find({ $or: conditions }).limit(100).lean();
    result[collection] = [];
    for (const doc of docs) {
      const relations = await relationSummary(collection, doc._id);
      result[collection].push({
        collection,
        id: doc._id,
        name: itemName(collection, doc),
        reason: reasonFor(doc, config.fields),
        hasRelations: relations.hasRelations,
        warning: relations.hasRelations ? 'Tiene relaciones contables o de inventario. No borrar sin revision.' : 'Sin relaciones detectadas en revision rapida.'
      });
    }
    totalPossibleDemoRecords += result[collection].length;
  }

  result.summary = { totalPossibleDemoRecords };
  return result;
};

const detectDemo = async (req, res) => {
  try {
    return res.json(await detectPossibleDemoRecords());
  } catch (error) {
    return res.status(500).json({ message: 'Error detectando posibles datos demo.', error: error.message });
  }
};

const markDemo = async (req, res) => {
  try {
    const { items = [], confirm } = req.body;
    if (confirm !== true) return res.status(400).json({ message: 'Debe confirmar con confirm: true.' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'Debe enviar items para marcar.' });

    const marked = [];
    for (const item of items) {
      const config = collections[item.collection];
      if (!config || !mongoose.Types.ObjectId.isValid(item.id)) continue;
      const doc = await config.Model.findById(item.id);
      if (!doc) continue;
      const before = doc.toObject();
      doc.isDemo = true;
      await doc.save();
      marked.push({ collection: item.collection, id: doc._id, name: itemName(item.collection, doc) });
      await createAuditLog({ req, action: 'UPDATE', module: 'dataCleanup', entityId: doc._id, entityType: config.label, description: `Registro marcado como demo: ${item.collection}`, before, after: doc.toObject() });
    }
    return res.json({ markedCount: marked.length, marked });
  } catch (error) {
    return res.status(500).json({ message: 'Error marcando datos demo.', error: error.message });
  }
};

const buildDeletePreview = async (requestedCollections = Object.keys(collections), onlyMarkedDemo = true) => {
  const safeToDelete = [];
  const riskyToDelete = [];
  const blocked = [];

  for (const collection of requestedCollections) {
    const config = collections[collection];
    if (!config) continue;
    const filter = onlyMarkedDemo ? { isDemo: true } : {};
    const docs = await config.Model.find(filter).limit(200).lean();

    for (const doc of docs) {
      const relations = await relationSummary(collection, doc._id);
      const item = {
        collection,
        id: doc._id,
        name: itemName(collection, doc),
        relations: relations.counts,
        warning: relations.hasRelations ? 'Tiene relaciones. Eliminacion bloqueada o riesgosa.' : 'Sin relaciones detectadas.'
      };

      if (['sales', 'purchases', 'payments', 'supplierPayments'].includes(collection)) {
        blocked.push({ ...item, classification: 'blocked', reason: 'Documento transaccional contable. No se elimina automaticamente.' });
      } else if (relations.hasRelations) {
        blocked.push({ ...item, classification: 'blocked', reason: 'Tiene relaciones contables, inventario o kardex.' });
      } else {
        safeToDelete.push({ ...item, classification: 'safeToDelete', reason: 'Marcado demo y sin relaciones detectadas.' });
      }
    }
  }

  return { safeToDelete, riskyToDelete, blocked, summary: { safe: safeToDelete.length, risky: riskyToDelete.length, blocked: blocked.length } };
};

const deleteDemoPreview = async (req, res) => {
  try {
    const { collections: requestedCollections, onlyMarkedDemo = true } = req.body || {};
    return res.json(await buildDeletePreview(requestedCollections || Object.keys(collections), onlyMarkedDemo));
  } catch (error) {
    return res.status(500).json({ message: 'Error generando preview de eliminacion demo.', error: error.message });
  }
};

const deleteDemoApply = async (req, res) => {
  try {
    const { confirm, deleteOnlySafe = true } = req.body;
    if (confirm !== true) return res.status(400).json({ message: 'Debe confirmar con confirm: true.' });
    if (deleteOnlySafe !== true) return res.status(400).json({ message: 'Por seguridad solo se permite deleteOnlySafe: true.' });

    const preview = await buildDeletePreview(Object.keys(collections), true);
    const deleted = [];
    for (const item of preview.safeToDelete) {
      const config = collections[item.collection];
      const doc = await config.Model.findById(item.id);
      if (!doc || doc.isDemo !== true) continue;
      const before = doc.toObject();
      await config.Model.deleteOne({ _id: doc._id, isDemo: true });
      deleted.push(item);
      await createAuditLog({ req, action: 'DELETE', module: 'dataCleanup', entityId: doc._id, entityType: config.label, description: `Dato demo seguro eliminado: ${item.collection}`, before, metadata: item });
    }

    return res.json({ deletedCount: deleted.length, deleted, blocked: preview.blocked, riskyToDelete: preview.riskyToDelete });
  } catch (error) {
    return res.status(500).json({ message: 'Error aplicando eliminacion demo.', error: error.message });
  }
};

const findProductsWithoutBatches = async () => {
  const products = await Product.find({ stock: { $gt: 0 } }).select('name sku stock unitCost').lean();
  const rows = [];
  for (const product of products) {
    const batches = await ProductBatch.find({ product: product._id }).select('availableQuantity').lean();
    const batchesAvailable = batches.reduce((sum, batch) => sum + Number(batch.availableQuantity || 0), 0);
    const missingBatchQuantity = Number(product.stock || 0) - batchesAvailable;
    if (missingBatchQuantity > 0) {
      rows.push({
        productId: product._id,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        batchesAvailable,
        missingBatchQuantity,
        unitCost: product.unitCost,
        warning: 'Producto con stock historico sin lotes suficientes. Crear lote inicial real no aumenta stock.'
      });
    }
  }
  return rows;
};

const productsWithoutBatches = async (req, res) => {
  try {
    const rows = await findProductsWithoutBatches();
    return res.json({ data: rows, summary: { totalProducts: rows.length, totalMissingQuantity: rows.reduce((sum, item) => sum + item.missingBatchQuantity, 0) } });
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando productos sin lotes suficientes.', error: error.message });
  }
};

const createInitialBatch = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { productId, batchNumber, quantity, expirationDate, unitCost, supplierId, notes, override, confirm } = req.body;
    const batchQuantity = Number(quantity);
    const cost = Number(unitCost);
    if (!productId || !batchNumber || !expirationDate || !batchQuantity || batchQuantity <= 0 || !cost || cost <= 0) {
      return res.status(400).json({ message: 'Producto, lote, cantidad, vencimiento y costo unitario son obligatorios.' });
    }

    let createdBatch;
    let productAfterCreate;
    await session.withTransaction(async () => {
      const product = await Product.findById(productId).session(session);
      if (!product) throw Object.assign(new Error('Producto no encontrado.'), { statusCode: 404 });
      const rows = await findProductsWithoutBatches();
      const target = rows.find((item) => item.productId.toString() === product._id.toString());
      const missing = Number(target?.missingBatchQuantity || 0);
      if (batchQuantity > missing && !(override === true && confirm === true && req.user?.role === 'admin')) {
        throw Object.assign(new Error(`La cantidad supera el faltante de lotes (${missing}). Solo admin puede usar override con confirm true.`), { statusCode: 400 });
      }
      if (missing <= 0 && !(override === true && confirm === true && req.user?.role === 'admin')) {
        throw Object.assign(new Error('El producto no tiene faltante de lotes por asignar.'), { statusCode: 400 });
      }
      const expiration = new Date(expirationDate);
      if (Number.isNaN(expiration.getTime())) throw Object.assign(new Error('Fecha de vencimiento invalida.'), { statusCode: 400 });

      const batch = await ProductBatch.create(
        [
          {
            product: product._id,
            supplier: supplierId || undefined,
            batchNumber,
            initialQuantity: batchQuantity,
            availableQuantity: batchQuantity,
            unitCost: cost,
            expirationDate: expiration,
            notes,
            isDemo: false
          }
        ],
        { session }
      );
      createdBatch = batch[0];

      await InventoryMovement.create(
        [
          {
            product: product._id,
            type: 'carga_inicial_lote',
            quantity: 0,
            unitCost: cost,
            previousStock: product.stock,
            newStock: product.stock,
            referenceType: 'Adjustment',
            referenceId: createdBatch._id.toString(),
            batch: createdBatch._id,
            batchNumber,
            description: `Carga inicial de lote real por ${batchQuantity} unidades. No aumenta stock.`,
            user: req.user?._id
          }
        ],
        { session }
      );
      productAfterCreate = product;
    });

    const populated = await ProductBatch.findById(createdBatch._id).populate('product').populate('supplier');
    await createAuditLog({ req, action: 'CREATE', module: 'dataCleanup', entityId: populated._id, entityType: 'ProductBatch', description: 'Carga inicial de lote real para stock historico', after: populated.toObject() });
    const rowsAfter = await findProductsWithoutBatches();
    const updatedMissing = rowsAfter.find((item) => item.productId.toString() === productAfterCreate._id.toString());
    return res.status(201).json({
      batch: populated,
      product: {
        id: productAfterCreate._id,
        name: productAfterCreate.name,
        sku: productAfterCreate.sku,
        stock: productAfterCreate.stock
      },
      missingBatchQuantity: updatedMissing?.missingBatchQuantity || 0
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error creando lote inicial real.', error: error.message });
  } finally {
    await session.endSession();
  }
};

module.exports = {
  createInitialBatch,
  deleteDemoApply,
  deleteDemoPreview,
  detectDemo,
  detectPossibleDemoRecords,
  findProductsWithoutBatches,
  markDemo,
  productsWithoutBatches
};
