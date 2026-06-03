const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const CostHistory = require('../models/CostHistory');
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
const User = require('../models/User');
const Waste = require('../models/Waste');
const { summarizeBatchAvailability } = require('./saleAvailability');

const demoPatterns = [
  'prueba',
  'test',
  'demo',
  'auditoria',
  'auditoría',
  '4D',
  'F5',
  'LOTE-F5',
  'PRUEBA',
  'FC-AUD',
  'Proveedor Auditoria',
  'Mayorista Aliado Plus',
  'Colegio Santa Maria',
  'Cafeteria El Recreo'
];

const demoRegex = new RegExp(demoPatterns.map((pattern) => pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

const collections = {
  products: { Model: Product, label: 'Producto', fields: ['name', 'sku', 'category'], transactional: false },
  customers: { Model: Customer, label: 'Cliente', fields: ['name', 'document', 'email', 'phone', 'zone'], transactional: false },
  suppliers: { Model: Supplier, label: 'Proveedor', fields: ['name', 'document', 'email', 'phone', 'contactName'], transactional: false },
  sales: { Model: Sale, label: 'Venta', fields: ['routeZone', 'note'], transactional: true },
  purchases: { Model: Purchase, label: 'Compra', fields: ['invoiceNumber', 'note'], transactional: true },
  payments: { Model: Payment, label: 'Pago cliente', fields: ['note', 'paymentMethod'], transactional: true },
  supplierPayments: { Model: SupplierPayment, label: 'Pago proveedor', fields: ['note', 'paymentMethod'], transactional: true },
  expenses: { Model: Expense, label: 'Gasto', fields: ['concept', 'category', 'description'], transactional: false },
  productBatches: { Model: ProductBatch, label: 'Lote', fields: ['batchNumber', 'notes'], transactional: true },
  batches: { Model: ProductBatch, label: 'Lote', fields: ['batchNumber', 'notes'], transactional: true, aliasFor: 'productBatches' },
  wastes: { Model: Waste, label: 'Merma', fields: ['batchNumber', 'reason', 'description'], transactional: true },
  inventoryMovements: { Model: InventoryMovement, label: 'Kardex', fields: ['type', 'referenceType', 'description', 'batchNumber'], transactional: true },
  costHistories: { Model: CostHistory, label: 'Historial costo', fields: ['changeType', 'note'], transactional: true },
  auditLogs: { Model: AuditLog, label: 'Auditoria', fields: ['action', 'module', 'description', 'userName', 'userEmail'], transactional: true },
  users: { Model: User, label: 'Usuario', fields: ['name', 'email', 'role', 'status'], transactional: false, protected: true }
};

const operationalCollections = [
  'supplierPayments',
  'payments',
  'wastes',
  'inventoryMovements',
  'costHistories',
  'productBatches',
  'sales',
  'purchases',
  'expenses',
  'products',
  'customers',
  'suppliers'
];

const number = (value) => Number(value || 0);

const itemName = (collection, doc) => {
  if (collection === 'sales') return `Venta ${doc._id}`;
  if (collection === 'payments') return `Pago ${doc._id}`;
  if (collection === 'supplierPayments') return `Pago proveedor ${doc._id}`;
  if (collection === 'purchases') return doc.invoiceNumber || `Compra ${doc._id}`;
  if (collection === 'productBatches' || collection === 'batches') return doc.batchNumber || `Lote ${doc._id}`;
  if (collection === 'wastes') return doc.batchNumber || `Merma ${doc._id}`;
  if (collection === 'inventoryMovements') return `${doc.type || 'Movimiento'} ${doc._id}`;
  if (collection === 'costHistories') return `${doc.changeType || 'Costo'} ${doc._id}`;
  if (collection === 'auditLogs') return `${doc.module || 'Auditoria'} ${doc.action || ''} ${doc._id}`;
  if (collection === 'users') return doc.email || doc.name || doc._id.toString();
  return doc.name || doc.concept || doc._id.toString();
};

const reasonFor = (doc, fields) => {
  const matchedField = fields.find((field) => demoRegex.test(String(doc[field] || '')));
  return matchedField ? `Patron demo detectado en ${matchedField}: ${doc[matchedField]}` : 'Marcado como posible demo por patron.';
};

const supportsIsDemo = (Model) => Boolean(Model.schema?.path?.('isDemo'));

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
    counts.payments = await Payment.countDocuments({ 'appliedToSales.sale': objectId });
  } else if (collection === 'purchases') {
    counts.batches = await ProductBatch.countDocuments({ purchase: objectId });
    counts.kardex = await InventoryMovement.countDocuments({ referenceType: 'Purchase', referenceId: id.toString() });
    counts.supplierPayments = await SupplierPayment.countDocuments({ 'appliedToPurchases.purchase': objectId });
  } else if (collection === 'productBatches' || collection === 'batches') {
    counts.kardex = await InventoryMovement.countDocuments({ batch: objectId });
    counts.wastes = await Waste.countDocuments({ batch: objectId });
  } else if (collection === 'wastes') {
    counts.kardex = await InventoryMovement.countDocuments({ referenceType: 'Waste', referenceId: id.toString() });
  } else if (collection === 'payments') {
    counts.appliedSales = await Payment.countDocuments({ _id: objectId, 'appliedToSales.0': { $exists: true } });
  } else if (collection === 'supplierPayments') {
    counts.appliedPurchases = await SupplierPayment.countDocuments({ _id: objectId, 'appliedToPurchases.0': { $exists: true } });
  }

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { counts, hasRelations: total > 0 };
};

const findPossibleDemoRecords = async (requestedCollections = Object.keys(collections), patterns = demoPatterns, includeMarkedDemo = true) => {
  const patternRegex = new RegExp(patterns.map((pattern) => String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
  const result = {};
  let totalPossibleDemoRecords = 0;

  for (const collection of requestedCollections) {
    const config = collections[collection];
    if (!config) continue;
    const fields = config.fields || [];
    const or = fields.map((field) => ({ [field]: patternRegex }));
    if (includeMarkedDemo && supportsIsDemo(config.Model)) or.push({ isDemo: true });
    if (or.length === 0) continue;

    const docs = await config.Model.find({ $or: or }).limit(300).lean();
    result[collection] = [];
    for (const doc of docs) {
      const relations = await relationSummary(collection, doc._id);
      result[collection].push({
        collection,
        id: doc._id,
        name: itemName(collection, doc),
        reason: doc.isDemo ? 'Registro marcado con isDemo=true.' : reasonFor(doc, fields),
        relations: relations.counts,
        hasRelations: relations.hasRelations,
        risk: config.transactional || relations.hasRelations ? 'bloqueado' : 'bajo',
        warning: config.transactional
          ? 'Documento operativo o contable. No borrar automaticamente.'
          : relations.hasRelations
            ? 'Tiene relaciones contables o de inventario. No borrar sin revision.'
            : 'Sin relaciones detectadas en revision rapida.'
      });
    }
    totalPossibleDemoRecords += result[collection].length;
  }

  result.summary = { totalPossibleDemoRecords };
  return result;
};

const collectStockVsBatches = async () => {
  const products = await Product.find().select('name sku stock salePrice unitCost').lean();
  const rows = [];
  for (const product of products) {
    const batches = await ProductBatch.find({ product: product._id }).select('availableQuantity').lean();
    const batchStock = batches.reduce((sum, batch) => sum + number(batch.availableQuantity), 0);
    const difference = number(product.stock) - batchStock;
    if (difference !== 0 || (number(product.stock) > 0 && batches.length === 0)) {
      rows.push({
        product: product.name,
        sku: product.sku,
        stock: number(product.stock),
        batchStock,
        difference,
        recommendation: difference > 0
          ? 'Revisar stock historico sin lote o cargar lote real verificado.'
          : 'Revisar lotes disponibles que superan stock maestro.'
      });
    }
  }
  return rows;
};

const collectFefoReadiness = async () => {
  const products = await Product.find().select('name sku stock salePrice unitCost').lean();
  const rows = [];
  for (const product of products) {
    const batches = await ProductBatch.find({ product: product._id }).select('batchNumber availableQuantity expirationDate status createdAt').lean();
    const availability = summarizeBatchAvailability(product, batches);
    if (
      availability.availability.generalStock > 0 ||
      availability.availability.sellableBatchQuantity > 0 ||
      availability.availability.expiredBatchQuantity > 0 ||
      availability.availability.blockedBatchQuantity > 0
    ) {
      rows.push({
        product: product.name,
        sku: product.sku,
        stock: availability.availability.generalStock,
        sellable: availability.availability.sellableBatchQuantity,
        expired: availability.availability.expiredBatchQuantity,
        blocked: availability.availability.blockedBatchQuantity,
        difference: availability.availability.generalStock - availability.availability.sellableBatchQuantity,
        recommendations: availability.recommendations
      });
    }
  }
  return rows;
};

const buildRealReadinessReport = async () => {
  const collectionsCount = {};
  const demoMarked = {};

  for (const [collection, config] of Object.entries(collections)) {
    if (config.aliasFor) continue;
    collectionsCount[collection] = await config.Model.countDocuments();
    if (supportsIsDemo(config.Model)) {
      demoMarked[collection] = await config.Model.countDocuments({ isDemo: true });
    }
  }

  const [
    possibleDemo,
    expiredBatchesWithStock,
    stockVsBatches,
    customersWithDebt,
    suppliersWithDebt,
    productsNegativeStock,
    customersNegativeDebt,
    suppliersNegativeDebt,
    activeAdmins,
    fefoReadiness
  ] = await Promise.all([
    findPossibleDemoRecords(),
    ProductBatch.find({ expirationDate: { $lt: new Date() }, availableQuantity: { $gt: 0 } }).populate('product', 'name sku').select('product batchNumber availableQuantity expirationDate status').lean(),
    collectStockVsBatches(),
    Customer.find({ currentDebt: { $gt: 0 } }).select('name document currentDebt').lean(),
    Supplier.find({ currentDebt: { $gt: 0 } }).select('name document currentDebt').lean(),
    Product.find({ stock: { $lt: 0 } }).select('name sku stock').lean(),
    Customer.find({ currentDebt: { $lt: 0 } }).select('name document currentDebt').lean(),
    Supplier.find({ currentDebt: { $lt: 0 } }).select('name document currentDebt').lean(),
    User.find({ role: 'admin', status: 'activo' }).select('name email role status').lean(),
    collectFefoReadiness()
  ]);

  const riskyRecords = [];
  const blockedRecords = [];
  for (const [collection, rows] of Object.entries(possibleDemo)) {
    if (collection === 'summary') continue;
    rows.forEach((row) => {
      if (row.risk === 'bloqueado') blockedRecords.push(row);
      else if (row.hasRelations) riskyRecords.push(row);
    });
  }

  const recommendations = [
    'Ejecute primero vista previa antes de marcar o borrar datos demo.',
    'No elimine ventas, compras, pagos, kardex, lotes ni auditoria desde limpieza selectiva.',
    'Para iniciar operacion real, use preview de reinicio y active ALLOW_OPERATIONAL_RESET solo con autorizacion y respaldo.',
    'Conserve usuarios admin activos para no romper login.'
  ];

  if (expiredBatchesWithStock.length > 0) recommendations.push('Hay lotes vencidos con stock: registre merma, bloquee o corrija fecha con razon.');
  if (stockVsBatches.length > 0) recommendations.push('Hay diferencias stock/lotes: revise conciliacion antes de vender.');

  return {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    collectionsCount,
    possibleDemo,
    demoMarked,
    riskyRecords,
    blockedRecords,
    inventory: {
      expiredBatchesWithStock: expiredBatchesWithStock.map((batch) => ({
        product: batch.product?.name,
        sku: batch.product?.sku,
        batchNumber: batch.batchNumber,
        availableQuantity: batch.availableQuantity,
        expirationDate: batch.expirationDate,
        status: batch.status
      })),
      stockVsBatches,
      fefoReadiness,
      productsNegativeStock
    },
    financial: {
      customersWithDebt,
      suppliersWithDebt,
      customersNegativeDebt,
      suppliersNegativeDebt
    },
    users: {
      activeAdmins,
      activeAdminCount: activeAdmins.length
    },
    risks: {
      noActiveAdmin: activeAdmins.length === 0,
      hasTransactions: ['sales', 'purchases', 'payments', 'supplierPayments'].some((collection) => collectionsCount[collection] > 0),
      hasInventoryMovements: collectionsCount.inventoryMovements > 0,
      hasExpiredStock: expiredBatchesWithStock.length > 0,
      hasStockBatchDifferences: stockVsBatches.length > 0
    },
    recommendations
  };
};

module.exports = {
  buildRealReadinessReport,
  collections,
  demoPatterns,
  findPossibleDemoRecords,
  itemName,
  operationalCollections,
  relationSummary,
  supportsIsDemo
};
