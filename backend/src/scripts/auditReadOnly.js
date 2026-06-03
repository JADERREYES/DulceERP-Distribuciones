require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');

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
const { detectPossibleDemoRecords, findProductsWithoutBatches } = require('../controllers/dataCleanup.controller');
const { summarizeBatchAvailability } = require('../utils/saleAvailability');

const models = {
  users: User,
  products: Product,
  productBatches: ProductBatch,
  customers: Customer,
  sales: Sale,
  payments: Payment,
  suppliers: Supplier,
  purchases: Purchase,
  supplierPayments: SupplierPayment,
  expenses: Expense,
  wastes: Waste,
  inventoryMovements: InventoryMovement,
  costHistory: CostHistory,
  auditLogs: AuditLog
};

const money = (value) => Number(value || 0).toLocaleString('es-CO');
const number = (value) => Number(value || 0);

const toDateOnly = (date) => {
  const value = new Date(date);
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
};

const daysExpired = (expirationDate, referenceDate = new Date()) => {
  if (!expirationDate) return null;
  const expiration = toDateOnly(expirationDate);
  const reference = toDateOnly(referenceDate);
  return Math.max(0, Math.floor((reference - expiration) / (1000 * 60 * 60 * 24)));
};

const expiredBatchRecommendation = () => (
  'Registrar merma por vencimiento si el producto no es comercializable; bloquear lote mientras se revisa; corregir fecha con razon si fue error de digitacion.'
);

const stockDifferenceCause = (difference, hasBatches) => {
  if (!hasBatches) {
    return 'Producto con stock maestro pero sin lotes registrados; posible inventario historico anterior a lotes o carga inicial pendiente.';
  }
  if (difference > 0) {
    return 'Stock maestro mayor que lotes disponibles; posible compra/venta historica sin lote, carga inicial pendiente o movimiento no asociado a lote.';
  }
  if (difference < 0) {
    return 'Lotes disponibles superan stock maestro; posible salida, merma, venta, anulacion o reverso aplicado de forma parcial entre producto y lote.';
  }
  return 'Sin diferencia.';
};

const stockDifferenceRecommendation = (hasBatches) => {
  if (!hasBatches) {
    return 'Verificar inventario fisico y crear carga inicial de lote real solo con autorizacion; no ajustar stock automaticamente.';
  }
  return 'Revisar Kardex, compras, ventas, mermas y lotes del producto; aplicar correccion controlada solo con autorizacion.';
};

const sum = async (Model, field, filter = {}) => {
  const result = await Model.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: `$${field}` } } }
  ]);
  return result[0]?.total || 0;
};

const collectStockVsBatches = async () => {
  const products = await Product.find().select('name sku stock').lean();
  const rows = [];
  for (const product of products) {
    const batches = await ProductBatch.find({ product: product._id }).select('availableQuantity').lean();
    if (batches.length === 0) {
      const stock = number(product.stock);
      rows.push({
        producto: product.name,
        product: product.name,
        sku: product.sku,
        status: 'partial',
        stockProducto: stock,
        stock,
        sumaLotesDisponibles: 0,
        batchStock: 0,
        diferencia: stock,
        difference: stock,
        posibleCausa: stockDifferenceCause(stock, false),
        accionRecomendada: stockDifferenceRecommendation(false),
        reason: 'Producto sin lotes historicos.'
      });
      continue;
    }
    const batchStock = batches.reduce((total, batch) => total + number(batch.availableQuantity), 0);
    const stock = number(product.stock);
    const difference = stock - batchStock;
    if (difference !== 0) {
      rows.push({
        producto: product.name,
        product: product.name,
        sku: product.sku,
        status: 'inconsistent',
        stockProducto: stock,
        stock,
        sumaLotesDisponibles: batchStock,
        batchStock,
        diferencia: difference,
        difference,
        posibleCausa: stockDifferenceCause(difference, true),
        accionRecomendada: stockDifferenceRecommendation(true),
        reason: 'Stock de producto no coincide con suma de lotes.'
      });
    }
  }
  return rows;
};

const buildExpiredBatchDiagnostic = (row, referenceDate = new Date()) => {
  const cantidadDisponible = number(row.availableQuantity);
  const costoUnitario = number(row.unitCost);
  return {
    producto: row.product?.name || 'Producto no encontrado',
    sku: row.product?.sku || 'Sin SKU',
    lote: row.batchNumber,
    cantidadDisponible,
    vencimiento: row.expirationDate,
    diasVencido: daysExpired(row.expirationDate, referenceDate),
    costoUnitario,
    valorEstimado: cantidadDisponible * costoUnitario,
    recomendacion: expiredBatchRecommendation()
  };
};

const collectSaleInventoryDiagnostics = async (referenceDate = new Date()) => {
  const products = await Product.find().select('name sku stock').lean();
  const productsWithStockNoAvailableBatches = [];
  const productStockGreaterThanBatchAvailable = [];
  const batchAvailableGreaterThanProductStock = [];

  for (const product of products) {
    const batches = await ProductBatch.find({ product: product._id }).select('availableQuantity').lean();
    const availableBatchStock = batches.reduce((total, batch) => total + number(batch.availableQuantity), 0);
    const productStock = number(product.stock);

    if (productStock > 0 && availableBatchStock <= 0) {
      productsWithStockNoAvailableBatches.push({
        producto: product.name,
        sku: product.sku,
        stockProducto: productStock,
        sumaLotesDisponibles: availableBatchStock,
        recomendacion: 'Cargar lote real verificado antes de vender; no ajustar stock automaticamente.'
      });
    }

    if (productStock > availableBatchStock) {
      productStockGreaterThanBatchAvailable.push({
        producto: product.name,
        sku: product.sku,
        stockProducto: productStock,
        sumaLotesDisponibles: availableBatchStock,
        diferencia: productStock - availableBatchStock
      });
    }

    if (availableBatchStock > productStock) {
      batchAvailableGreaterThanProductStock.push({
        producto: product.name,
        sku: product.sku,
        stockProducto: productStock,
        sumaLotesDisponibles: availableBatchStock,
        diferencia: productStock - availableBatchStock
      });
    }
  }

  const [expiredBatches, blockedBatches] = await Promise.all([
    ProductBatch.find({ expirationDate: { $lt: referenceDate }, availableQuantity: { $gt: 0 } })
      .populate('product', 'name sku')
      .select('product batchNumber availableQuantity expirationDate status')
      .lean(),
    ProductBatch.find({ status: 'bloqueado', availableQuantity: { $gt: 0 } })
      .populate('product', 'name sku')
      .select('product batchNumber availableQuantity expirationDate status')
      .lean()
  ]);

  return {
    productsWithStockNoAvailableBatches,
    productsWithExpiredBatches: expiredBatches.map((batch) => ({
      producto: batch.product?.name || 'Producto no encontrado',
      sku: batch.product?.sku || 'Sin SKU',
      lote: batch.batchNumber,
      cantidadDisponible: number(batch.availableQuantity),
      vencimiento: batch.expirationDate,
      estado: batch.status
    })),
    productsWithBlockedBatches: blockedBatches.map((batch) => ({
      producto: batch.product?.name || 'Producto no encontrado',
      sku: batch.product?.sku || 'Sin SKU',
      lote: batch.batchNumber,
      cantidadDisponible: number(batch.availableQuantity),
      vencimiento: batch.expirationDate,
      estado: batch.status
    })),
    productStockGreaterThanBatchAvailable,
    batchAvailableGreaterThanProductStock
  };
};

const collectFefoProductDiagnostics = async (referenceDate = new Date()) => {
  const products = await Product.find().select('name sku stock salePrice unitCost').lean();
  const diagnostics = [];

  for (const product of products) {
    const batches = await ProductBatch.find({ product: product._id })
      .select('batchNumber availableQuantity expirationDate status createdAt')
      .lean();
    const availability = summarizeBatchAvailability(product, batches, referenceDate);
    const expiredQuantity = availability.availability.expiredBatchQuantity;
    const difference = availability.availability.generalStock - availability.availability.sellableBatchQuantity;

    if (availability.availability.generalStock > 0 || availability.sellableBatches.length > 0 || availability.nonSellableBatches.length > 0) {
      diagnostics.push({
        producto: product.name,
        sku: product.sku,
        stockGeneral: availability.availability.generalStock,
        lotesVendibles: availability.availability.sellableBatchQuantity,
        lotesVencidos: expiredQuantity,
        diferencia: difference,
        recomendacion: availability.recommendations.join(' ')
      });
    }
  }

  return diagnostics;
};

const main = async () => {
  await connectDB();

  const counts = {};
  for (const [name, Model] of Object.entries(models)) {
    counts[name] = await Model.countDocuments();
  }

  const now = new Date();
  const [
    productsNegativeStock,
    batchesNegativeQty,
    customersNegativeDebt,
    suppliersNegativeDebt,
    salesNegativeBalance,
    purchasesNegativeBalance,
    expiredBatchesWithStock,
    canceledSalesWithBalance,
    canceledPurchasesWithBalance,
    stockVsBatches,
    possibleDemo,
    productsWithoutBatches,
    customerDebt,
    pendingSaleBalance,
    supplierDebt,
    pendingPurchaseBalance,
    totalWasteCost
  ] = await Promise.all([
    Product.find({ stock: { $lt: 0 } }).select('name sku stock').lean(),
    ProductBatch.find({ availableQuantity: { $lt: 0 } }).populate('product', 'name sku').select('batchNumber availableQuantity product').lean(),
    Customer.find({ currentDebt: { $lt: 0 } }).select('name document currentDebt').lean(),
    Supplier.find({ currentDebt: { $lt: 0 } }).select('name document currentDebt').lean(),
    Sale.find({ balance: { $lt: 0 } }).populate('customer', 'name document').select('customer total paidAmount balance paymentStatus').lean(),
    Purchase.find({ balance: { $lt: 0 } }).populate('supplier', 'name document').select('supplier total paidAmount balance paymentStatus').lean(),
    ProductBatch.find({ expirationDate: { $lt: now }, availableQuantity: { $gt: 0 } }).populate('product', 'name sku').select('batchNumber expirationDate availableQuantity unitCost product').lean(),
    Sale.find({ status: 'anulada', balance: { $gt: 0 } }).populate('customer', 'name document').select('customer total balance').lean(),
    Purchase.find({ status: 'anulada', balance: { $gt: 0 } }).populate('supplier', 'name document').select('supplier total balance').lean(),
    collectStockVsBatches(),
    detectPossibleDemoRecords(),
    findProductsWithoutBatches(),
    sum(Customer, 'currentDebt'),
    sum(Sale, 'balance', { status: { $ne: 'anulada' }, paymentMethod: 'credito', paymentStatus: 'pendiente' }),
    sum(Supplier, 'currentDebt'),
    sum(Purchase, 'balance', { status: { $ne: 'anulada' }, paymentMethod: 'credito', paymentStatus: 'pendiente' }),
    sum(Waste, 'totalCost')
  ]);

  const financial = {
    receivables: {
      customersDebt: customerDebt,
      pendingSaleBalance,
      difference: customerDebt - pendingSaleBalance
    },
    payables: {
      suppliersDebt: supplierDebt,
      pendingPurchaseBalance,
      difference: supplierDebt - pendingPurchaseBalance
    },
    totalWasteCost
  };

  const expiredBatchDiagnostics = expiredBatchesWithStock.map((row) => buildExpiredBatchDiagnostic(row, now));
  const saleInventoryDiagnostics = await collectSaleInventoryDiagnostics(now);
  const fefoProductDiagnostics = await collectFefoProductDiagnostics(now);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    counts,
    inconsistencies: {
      productsNegativeStock,
      batchesNegativeQty,
      customersNegativeDebt,
      suppliersNegativeDebt,
      salesNegativeBalance,
      purchasesNegativeBalance,
      expiredBatchesWithStock,
      stockVsBatches,
      canceledSalesWithBalance,
      canceledPurchasesWithBalance
    },
    inventoryDiagnostics: {
      expiredBatchesWithStock: expiredBatchDiagnostics,
      stockVsBatches,
      saleInventoryDiagnostics,
      fefoProductDiagnostics
    },
    financial
  };
  report.demo = {
    markedDemo: {},
    possibleDemoSummary: possibleDemo.summary,
    possibleDemo
  };
  for (const [name, config] of Object.entries(models)) {
    if (config.schema?.path?.('isDemo')) {
      report.demo.markedDemo[name] = await config.countDocuments({ isDemo: true });
    }
  }
  report.productsWithoutBatches = productsWithoutBatches;

  console.log('AUDITORIA READ-ONLY DULCEERP');
  console.log(`Fecha: ${report.generatedAt}`);
  console.log('Modo: SOLO LECTURA. No se modifican datos.');
  console.log('\nConteo de documentos:');
  Object.entries(counts).forEach(([name, count]) => console.log(`- ${name}: ${count}`));
  console.log('\nConciliacion financiera de lectura:');
  console.log(`- Clientes deuda: $${money(financial.receivables.customersDebt)}`);
  console.log(`- Ventas credito pendientes balance: $${money(financial.receivables.pendingSaleBalance)}`);
  console.log(`- Diferencia cartera: $${money(financial.receivables.difference)}`);
  console.log(`- Proveedores deuda: $${money(financial.payables.suppliersDebt)}`);
  console.log(`- Compras credito pendientes balance: $${money(financial.payables.pendingPurchaseBalance)}`);
  console.log(`- Diferencia proveedores: $${money(financial.payables.difference)}`);
  console.log(`- Costo total de mermas: $${money(financial.totalWasteCost)}`);
  console.log('\nInconsistencias detectadas:');
  Object.entries(report.inconsistencies).forEach(([name, rows]) => console.log(`- ${name}: ${rows.length}`));
  console.log(`- Total lotes vencidos con stock disponible: ${expiredBatchesWithStock.length}`);
  console.log('\nDatos demo:');
  console.log(`- Posibles registros demo por patron: ${possibleDemo.summary.totalPossibleDemoRecords}`);
  Object.entries(report.demo.markedDemo).forEach(([name, count]) => console.log(`- ${name} isDemo=true: ${count}`));
  console.log(`- Productos con stock sin lotes suficientes: ${productsWithoutBatches.length}`);
  console.log('\nDiagnostico inventario para ventas FEFO:');
  console.log(`- Productos con stock sin lotes disponibles: ${saleInventoryDiagnostics.productsWithStockNoAvailableBatches.length}`);
  console.log(`- Productos/lotes vencidos con stock: ${saleInventoryDiagnostics.productsWithExpiredBatches.length}`);
  console.log(`- Productos/lotes bloqueados con stock: ${saleInventoryDiagnostics.productsWithBlockedBatches.length}`);
  console.log(`- Product.stock > suma lotes disponibles: ${saleInventoryDiagnostics.productStockGreaterThanBatchAvailable.length}`);
  console.log(`- Suma lotes disponibles > Product.stock: ${saleInventoryDiagnostics.batchAvailableGreaterThanProductStock.length}`);
  console.log(`- Diagnostico FEFO por producto: ${fefoProductDiagnostics.length}`);

  const relevant = Object.entries(report.inconsistencies).filter(([, rows]) => rows.length > 0);
  if (relevant.length > 0) {
    console.log('\nDetalle resumido:');
    for (const [name, rows] of relevant) {
      console.log(`\n${name}:`);
      if (name === 'expiredBatchesWithStock') {
        expiredBatchDiagnostics.forEach((row) => console.log(JSON.stringify(row)));
      } else {
        rows.forEach((row) => console.log(JSON.stringify(row)));
      }
    }
  }

  if (fefoProductDiagnostics.length > 0) {
    console.log('\nDiagnostico FEFO por producto:');
    fefoProductDiagnostics.forEach((row) => console.log(JSON.stringify(row)));
  }

  await mongoose.disconnect();
  console.log('\nConexion MongoDB cerrada');
};

main().catch(async (error) => {
  console.error('Error ejecutando auditoria read-only:', error.message);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('Conexion MongoDB cerrada');
  }
  process.exit(1);
});
