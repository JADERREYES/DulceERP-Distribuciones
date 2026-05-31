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
      rows.push({
        product: product.name,
        sku: product.sku,
        status: 'partial',
        stock: product.stock,
        batchStock: null,
        difference: null,
        reason: 'Producto sin lotes historicos.'
      });
      continue;
    }
    const batchStock = batches.reduce((total, batch) => total + Number(batch.availableQuantity || 0), 0);
    const difference = Number(product.stock || 0) - batchStock;
    if (difference !== 0) {
      rows.push({
        product: product.name,
        sku: product.sku,
        status: 'inconsistent',
        stock: product.stock,
        batchStock,
        difference,
        reason: 'Stock de producto no coincide con suma de lotes.'
      });
    }
  }
  return rows;
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

  const relevant = Object.entries(report.inconsistencies).filter(([, rows]) => rows.length > 0);
  if (relevant.length > 0) {
    console.log('\nDetalle resumido:');
    for (const [name, rows] of relevant) {
      console.log(`\n${name}:`);
      if (name === 'expiredBatchesWithStock') {
        rows.slice(0, 10).forEach((row) => console.log(JSON.stringify({
          producto: row.product?.name,
          sku: row.product?.sku,
          lote: row.batchNumber,
          cantidad: row.availableQuantity,
          vencimiento: row.expirationDate,
          costoTotal: Number(row.availableQuantity || 0) * Number(row.unitCost || 0)
        })));
      } else {
        rows.slice(0, 10).forEach((row) => console.log(JSON.stringify(row)));
      }
      if (rows.length > 10) console.log(`... ${rows.length - 10} registros adicionales`);
    }
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
