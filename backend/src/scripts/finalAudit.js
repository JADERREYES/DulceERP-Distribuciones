require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Customer = require('../models/Customer');
const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const Supplier = require('../models/Supplier');
const User = require('../models/User');
const { findProductsWithoutBatches } = require('../controllers/dataCleanup.controller');

const money = (value) => Number(value || 0).toLocaleString('es-CO');

const sum = async (Model, field, filter = {}) => {
  const result = await Model.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: `$${field}` } } }
  ]);
  return result[0]?.total || 0;
};

const countCollection = async (name) => mongoose.connection.db.collection(name).countDocuments();

const main = async () => {
  await connectDB();

  console.log('AUDITORIA FINAL DULCEERP');
  console.log(`Fecha: ${new Date().toISOString()}`);
  console.log('Modo: SOLO LECTURA. No se modifican datos.');

  const collections = [
    'users',
    'products',
    'productbatches',
    'customers',
    'sales',
    'payments',
    'suppliers',
    'purchases',
    'supplierpayments',
    'expenses',
    'wastes',
    'inventorymovements',
    'costhistories',
    'auditlogs'
  ];

  const counts = {};
  for (const collection of collections) {
    counts[collection] = await countCollection(collection);
  }

  const now = new Date();
  const [
    activeUsers,
    activeAdmins,
    productsNegativeStock,
    batchesNegativeQty,
    customersNegativeDebt,
    suppliersNegativeDebt,
    salesNegativeBalance,
    purchasesNegativeBalance,
    productsWithoutBatches,
    customerDebt,
    pendingSaleBalance,
    supplierDebt,
    pendingPurchaseBalance,
    expiredBatchesWithStock,
    canceledPurchasesWithBalance,
    canceledSalesWithBalance
  ] = await Promise.all([
    User.countDocuments({ status: { $nin: ['inactivo', 'bloqueado'] } }),
    User.countDocuments({ role: 'admin', status: { $nin: ['inactivo', 'bloqueado'] } }),
    Product.countDocuments({ stock: { $lt: 0 } }),
    ProductBatch.countDocuments({ availableQuantity: { $lt: 0 } }),
    Customer.countDocuments({ currentDebt: { $lt: 0 } }),
    Supplier.countDocuments({ currentDebt: { $lt: 0 } }),
    Sale.countDocuments({ balance: { $lt: 0 } }),
    Purchase.countDocuments({ balance: { $lt: 0 } }),
    findProductsWithoutBatches(),
    sum(Customer, 'currentDebt'),
    sum(Sale, 'balance', { status: { $ne: 'anulada' }, paymentMethod: 'credito', paymentStatus: 'pendiente' }),
    sum(Supplier, 'currentDebt'),
    sum(Purchase, 'balance', { status: { $ne: 'anulada' }, paymentMethod: 'credito', paymentStatus: 'pendiente' }),
    ProductBatch.countDocuments({ expirationDate: { $lt: now }, availableQuantity: { $gt: 0 } }),
    Purchase.countDocuments({ status: 'anulada', balance: { $gt: 0 } }),
    Sale.countDocuments({ status: 'anulada', balance: { $gt: 0 } })
  ]);

  const receivablesDifference = customerDebt - pendingSaleBalance;
  const payablesDifference = supplierDebt - pendingPurchaseBalance;

  console.log('\nDocumentos principales:');
  Object.entries(counts).forEach(([name, count]) => console.log(`- ${name}: ${count}`));

  console.log('\nUsuarios y acceso:');
  console.log(`- Usuarios activos: ${activeUsers}`);
  console.log(`- Administradores activos: ${activeAdmins}`);

  console.log('\nValidaciones contables e inventario:');
  console.log(`- Productos con stock negativo: ${productsNegativeStock}`);
  console.log(`- Lotes con cantidad negativa: ${batchesNegativeQty}`);
  console.log(`- Clientes con deuda negativa: ${customersNegativeDebt}`);
  console.log(`- Proveedores con deuda negativa: ${suppliersNegativeDebt}`);
  console.log(`- Ventas con balance negativo: ${salesNegativeBalance}`);
  console.log(`- Compras con balance negativo: ${purchasesNegativeBalance}`);
  console.log(`- Productos con stock sin lotes suficientes: ${productsWithoutBatches.length}`);
  console.log(`- Lotes vencidos con stock disponible: ${expiredBatchesWithStock}`);
  console.log(`- Ventas anuladas con balance pendiente: ${canceledSalesWithBalance}`);
  console.log(`- Compras anuladas con balance pendiente: ${canceledPurchasesWithBalance}`);

  console.log('\nConciliacion financiera:');
  console.log(`- Cartera clientes: $${money(customerDebt)}`);
  console.log(`- Ventas credito pendientes: $${money(pendingSaleBalance)}`);
  console.log(`- Diferencia cartera: $${money(receivablesDifference)}`);
  console.log(`- Deuda proveedores: $${money(supplierDebt)}`);
  console.log(`- Compras credito pendientes: $${money(pendingPurchaseBalance)}`);
  console.log(`- Diferencia proveedores: $${money(payablesDifference)}`);

  const blockingIssues = [
    activeAdmins === 0,
    productsNegativeStock > 0,
    batchesNegativeQty > 0,
    customersNegativeDebt > 0,
    suppliersNegativeDebt > 0,
    salesNegativeBalance > 0,
    purchasesNegativeBalance > 0,
    productsWithoutBatches.length > 0,
    receivablesDifference !== 0,
    payablesDifference !== 0,
    canceledPurchasesWithBalance > 0,
    canceledSalesWithBalance > 0
  ].filter(Boolean).length;

  console.log('\nResultado:');
  if (blockingIssues === 0) {
    console.log('OK tecnico: no se detectaron bloqueos criticos para exposicion.');
  } else {
    console.log(`Atencion: se detectaron ${blockingIssues} puntos que requieren revision antes de operacion empresarial.`);
  }

  await mongoose.disconnect();
  console.log('\nConexion MongoDB cerrada');
};

main().catch(async (error) => {
  console.error('Error ejecutando auditoria final:', error.message);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('Conexion MongoDB cerrada');
  }
  process.exit(1);
});
