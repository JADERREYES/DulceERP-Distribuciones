const AuditLog = require('../models/AuditLog');
const Customer = require('../models/Customer');
const Expense = require('../models/Expense');
const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const Supplier = require('../models/Supplier');
const Waste = require('../models/Waste');

const daysFromNow = (days) => {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  date.setDate(date.getDate() + days);
  return date;
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const safeNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const percent = (value, base) => {
  const denominator = safeNumber(base);
  if (denominator <= 0) return 0;
  return Number(((safeNumber(value) / denominator) * 100).toFixed(2));
};

const sum = (items, selector) => items.reduce((total, item) => total + safeNumber(selector(item)), 0);

const dateFilter = (field, from, to) => {
  const filter = {};
  if (from || to) {
    filter[field] = {};
    if (from) filter[field].$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter[field].$lte = end;
    }
  }
  return filter;
};

const getIncomeStatementData = async (from, to) => {
  const saleDateFilter = dateFilter('createdAt', from, to);
  const expenseDateFilter = dateFilter('date', from, to);
  const activeSales = await Sale.find({ ...saleDateFilter, status: 'activa' }).lean();
  const canceledSales = await Sale.find({ ...saleDateFilter, status: 'anulada' }).lean();
  const expenses = await Expense.find(expenseDateFilter).lean();

  const grossSales = sum(activeSales, (sale) => sale.total);
  const totalCMV = sum(activeSales, (sale) => sale.totalCost);
  const grossProfit = grossSales - totalCMV;
  const operationalExpenses = sum(expenses, (expense) => expense.amount);
  const netProfit = grossProfit - operationalExpenses;

  return {
    period: { from: from || null, to: to || null },
    message: activeSales.length === 0 && expenses.length === 0 ? 'No hay movimientos en el periodo consultado.' : '',
    grossSales,
    totalCMV,
    grossProfit,
    operationalExpenses,
    netProfit,
    grossMargin: percent(grossProfit, grossSales),
    netMargin: percent(netProfit, grossSales),
    salesCount: activeSales.length,
    cashSales: sum(activeSales.filter((sale) => sale.paymentMethod === 'contado'), (sale) => sale.total),
    creditSales: sum(activeSales.filter((sale) => sale.paymentMethod === 'credito'), (sale) => sale.total),
    canceledSales: sum(canceledSales, (sale) => sale.total),
    canceledSalesCount: canceledSales.length
  };
};

const getInventoryValuationData = async () => {
  const [products, batches] = await Promise.all([Product.find().lean(), ProductBatch.find().populate('product supplier').lean()]);
  const productInventoryValue = sum(products, (product) => safeNumber(product.stock) * safeNumber(product.unitCost));
  const batchInventoryValue = sum(batches, (batch) => safeNumber(batch.availableQuantity) * safeNumber(batch.unitCost));

  const stockWithoutEnoughBatches = [];
  for (const product of products) {
    const productBatches = batches.filter((batch) => String(batch.product?._id || batch.product) === String(product._id));
    const batchesAvailable = sum(productBatches, (batch) => batch.availableQuantity);
    const missingBatchQuantity = safeNumber(product.stock) - batchesAvailable;
    if (safeNumber(product.stock) > 0 && missingBatchQuantity > 0) {
      stockWithoutEnoughBatches.push({
        productId: product._id,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        batchesAvailable,
        missingBatchQuantity,
        unitCost: product.unitCost
      });
    }
  }

  const today = startOfToday();
  const limit = daysFromNow(30);
  const expiringBatches = batches.filter((batch) => batch.availableQuantity > 0 && new Date(batch.expirationDate) >= today && new Date(batch.expirationDate) <= limit);
  const expiredBatches = batches.filter((batch) => batch.availableQuantity > 0 && new Date(batch.expirationDate) < today);

  return {
    totalProducts: products.length,
    productInventoryValue,
    batchInventoryValue,
    productVsBatchDifference: productInventoryValue - batchInventoryValue,
    stockWithoutEnoughBatches,
    outOfStockProducts: products.filter((product) => product.status === 'agotado' || safeNumber(product.stock) <= 0),
    lowStockProducts: products.filter((product) => product.status === 'bajo_stock' || (safeNumber(product.stock) > 0 && safeNumber(product.stock) <= safeNumber(product.minStock))),
    expiringBatches,
    expiredBatches
  };
};

const getReceivablesData = async () => {
  const [customers, pendingSales] = await Promise.all([
    Customer.find().lean(),
    Sale.find({ status: 'activa', paymentMethod: 'credito', paymentStatus: 'pendiente' }).populate('customer').lean()
  ]);
  const customersWithDebt = customers.filter((customer) => safeNumber(customer.currentDebt) > 0);
  return {
    totalReceivables: sum(customers, (customer) => customer.currentDebt),
    customersWithDebt: customersWithDebt.length,
    riskCustomers: customers.filter((customer) => customer.status === 'riesgo').length,
    blockedCustomers: customers.filter((customer) => customer.status === 'bloqueado').length,
    pendingCreditSales: {
      count: pendingSales.length,
      total: sum(pendingSales, (sale) => sale.balance || sale.total)
    },
    topCustomersByDebt: customersWithDebt
      .sort((a, b) => safeNumber(b.currentDebt) - safeNumber(a.currentDebt))
      .slice(0, 10)
      .map((customer) => ({
        id: customer._id,
        name: customer.name,
        document: customer.document,
        zone: customer.zone,
        currentDebt: customer.currentDebt,
        creditLimit: customer.creditLimit,
        status: customer.status,
        creditUsagePercent: percent(customer.currentDebt, customer.creditLimit)
      })),
    balancesByCustomer: customersWithDebt.map((customer) => ({
      id: customer._id,
      name: customer.name,
      document: customer.document,
      zone: customer.zone,
      currentDebt: customer.currentDebt,
      creditLimit: customer.creditLimit,
      status: customer.status,
      creditUsagePercent: percent(customer.currentDebt, customer.creditLimit)
    }))
  };
};

const getPayablesData = async () => {
  const [suppliers, pendingPurchases] = await Promise.all([
    Supplier.find().lean(),
    Purchase.find({ status: 'activa', paymentMethod: 'credito', paymentStatus: 'pendiente' }).populate('supplier').lean()
  ]);
  const suppliersWithDebt = suppliers.filter((supplier) => safeNumber(supplier.currentDebt) > 0);
  return {
    totalPayables: sum(suppliers, (supplier) => supplier.currentDebt),
    suppliersWithDebt: suppliersWithDebt.length,
    pendingCreditPurchases: {
      count: pendingPurchases.length,
      total: sum(pendingPurchases, (purchase) => purchase.balance || purchase.total)
    },
    topSuppliersByDebt: suppliersWithDebt
      .sort((a, b) => safeNumber(b.currentDebt) - safeNumber(a.currentDebt))
      .slice(0, 10)
      .map((supplier) => ({
        id: supplier._id,
        name: supplier.name,
        document: supplier.document,
        currentDebt: supplier.currentDebt,
        creditLimit: supplier.creditLimit,
        status: supplier.status,
        creditUsagePercent: percent(supplier.currentDebt, supplier.creditLimit)
      })),
    balancesBySupplier: suppliersWithDebt.map((supplier) => ({
      id: supplier._id,
      name: supplier.name,
      document: supplier.document,
      currentDebt: supplier.currentDebt,
      creditLimit: supplier.creditLimit,
      status: supplier.status,
      creditUsagePercent: percent(supplier.currentDebt, supplier.creditLimit)
    }))
  };
};

const groupByName = (items, nameSelector, valueSelector) => {
  const map = new Map();
  for (const item of items) {
    const name = nameSelector(item) || 'Sin clasificar';
    const current = map.get(name) || { name, count: 0, totalCost: 0 };
    current.count += 1;
    current.totalCost += safeNumber(valueSelector(item));
    map.set(name, current);
  }
  return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
};

const getWastesData = async (from, to) => {
  const wastes = await Waste.find(dateFilter('createdAt', from, to)).populate('product batch').lean();
  return {
    period: { from: from || null, to: to || null },
    wasteCount: wastes.length,
    totalWasteCost: sum(wastes, (waste) => waste.totalCost),
    wastesByReason: groupByName(wastes, (waste) => waste.reason, (waste) => waste.totalCost),
    wastesByProduct: groupByName(wastes, (waste) => waste.product?.name, (waste) => waste.totalCost),
    wastesByBatch: groupByName(wastes, (waste) => waste.batchNumber || waste.batch?.batchNumber, (waste) => waste.totalCost)
  };
};

const getAuditSummaryData = async (from, to) => {
  const logs = await AuditLog.find(dateFilter('createdAt', from, to)).sort({ createdAt: -1 }).lean();
  const criticalActions = ['DELETE', 'CANCEL', 'PAYMENT', 'STATUS_CHANGE'];
  return {
    period: { from: from || null, to: to || null },
    totalEvents: logs.length,
    eventsByModule: groupByName(logs, (log) => log.module, () => 0).map((item) => ({ name: item.name, count: item.count })),
    eventsByUser: groupByName(logs, (log) => log.userName || log.userEmail || 'Sistema', () => 0).map((item) => ({ name: item.name, count: item.count })),
    criticalEvents: logs.filter((log) => criticalActions.includes(log.action)).length,
    lastRelevantEvents: logs
      .filter((log) => criticalActions.includes(log.action) || ['sales', 'purchases', 'payments', 'supplierPayments', 'wastes', 'dataCleanup'].includes(log.module))
      .slice(0, 20)
  };
};

const buildExecutiveAlerts = (inventory, receivables, payables, wastes) => {
  const alerts = [];
  if (inventory.stockWithoutEnoughBatches.length > 0) alerts.push({ type: 'warning', title: 'Stock historico sin lotes completos', message: `${inventory.stockWithoutEnoughBatches.length} productos requieren asignacion de lotes reales.` });
  if (inventory.expiredBatches.length > 0) alerts.push({ type: 'danger', title: 'Lotes vencidos con stock', message: `${inventory.expiredBatches.length} lotes vencidos conservan cantidad disponible.` });
  if (inventory.expiringBatches.length > 0) alerts.push({ type: 'warning', title: 'Lotes proximos a vencer', message: `${inventory.expiringBatches.length} lotes vencen en los proximos 30 dias.` });
  if (receivables.totalReceivables > 0) alerts.push({ type: 'info', title: 'Cartera pendiente', message: `Cuentas por cobrar: ${receivables.totalReceivables}.` });
  if (payables.totalPayables > 0) alerts.push({ type: 'info', title: 'Cuentas por pagar', message: `Obligaciones pendientes: ${payables.totalPayables}.` });
  if (wastes.totalWasteCost > 0) alerts.push({ type: 'warning', title: 'Mermas registradas', message: `Costo de mermas del periodo: ${wastes.totalWasteCost}.` });
  return alerts.slice(0, 8);
};

const incomeStatement = async (req, res) => {
  try {
    return res.json(await getIncomeStatementData(req.query.from, req.query.to));
  } catch (error) {
    return res.status(500).json({ message: 'Error generando estado de resultados.', error: error.message });
  }
};

const inventoryValuation = async (req, res) => {
  try {
    return res.json(await getInventoryValuationData());
  } catch (error) {
    return res.status(500).json({ message: 'Error generando inventario valorizado.', error: error.message });
  }
};

const receivables = async (req, res) => {
  try {
    return res.json(await getReceivablesData());
  } catch (error) {
    return res.status(500).json({ message: 'Error generando reporte de cartera.', error: error.message });
  }
};

const payables = async (req, res) => {
  try {
    return res.json(await getPayablesData());
  } catch (error) {
    return res.status(500).json({ message: 'Error generando reporte de cuentas por pagar.', error: error.message });
  }
};

const wastes = async (req, res) => {
  try {
    return res.json(await getWastesData(req.query.from, req.query.to));
  } catch (error) {
    return res.status(500).json({ message: 'Error generando reporte de mermas.', error: error.message });
  }
};

const auditSummary = async (req, res) => {
  try {
    return res.json(await getAuditSummaryData(req.query.from, req.query.to));
  } catch (error) {
    return res.status(500).json({ message: 'Error generando auditoria resumida.', error: error.message });
  }
};

const summary = async (req, res) => {
  try {
    const [income, inventory, receivableData, payableData, wasteData] = await Promise.all([
      getIncomeStatementData(req.query.from, req.query.to),
      getInventoryValuationData(),
      getReceivablesData(),
      getPayablesData(),
      getWastesData(req.query.from, req.query.to)
    ]);

    return res.json({
      dataMode: 'real',
      sales: income.grossSales,
      netProfit: income.netProfit,
      inventoryValue: inventory.productInventoryValue,
      receivables: receivableData.totalReceivables,
      payables: payableData.totalPayables,
      wastes: wasteData.totalWasteCost,
      expiringBatches: inventory.expiringBatches.length,
      mainAlerts: buildExecutiveAlerts(inventory, receivableData, payableData, wasteData),
      reconciliationStatus: {
        inventoryDifference: inventory.productVsBatchDifference,
        receivablesPendingDifference: receivableData.totalReceivables - receivableData.pendingCreditSales.total,
        payablesPendingDifference: payableData.totalPayables - payableData.pendingCreditPurchases.total
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error generando resumen ejecutivo.', error: error.message });
  }
};

module.exports = {
  auditSummary,
  incomeStatement,
  inventoryValuation,
  payables,
  receivables,
  summary,
  wastes
};
