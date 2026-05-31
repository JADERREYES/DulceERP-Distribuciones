const Customer = require('../models/Customer');
const Expense = require('../models/Expense');
const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const Sale = require('../models/Sale');
const Waste = require('../models/Waste');
const { financialReconciliationData, inventoryReconciliationData } = require('./reconciliation.controller');
const { findProductsWithoutBatches } = require('./dataCleanup.controller');

const BASE_INVESTMENT = 173620000;
const BASE_SALES = 190000000;
const BASE_CMV = 91480000;
const BASE_EXPENSES = 36600000;
const BASE_NET_PROFIT = 61920000;

const round = (value, decimals = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(decimals));
};

const safePercent = (value, base) => {
  if (!base || !Number.isFinite(value) || !Number.isFinite(base)) return 0;
  return (value / base) * 100;
};

const activeSaleMatch = { status: { $ne: 'anulada' } };

const sumField = async (Model, field, match = {}) => {
  const pipeline = [];
  if (Object.keys(match).length > 0) pipeline.push({ $match: match });
  pipeline.push({ $group: { _id: null, total: { $sum: `$${field}` } } });
  const result = await Model.aggregate(pipeline);
  return result[0]?.total || 0;
};

const getDates = () => {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const expirationLimit = new Date();
  expirationLimit.setDate(expirationLimit.getDate() + 30);
  return { now, startToday, startMonth, expirationLimit };
};

const buildSummary = async () => {
  const { startToday, startMonth, expirationLimit } = getDates();

  const [
    salesCount,
    salesTotal,
    cmvTotal,
    expensesTotal,
    totalProducts,
    lowStockProducts,
    expiredOrNearExpirationProducts,
    totalCustomers,
    blockedCustomers,
    riskCustomers,
    activeCustomers,
    receivables,
    receivablesRiskAmount,
    totalPaidSales,
    totalCreditSales,
    pendingCreditSales,
    todaySales,
    monthSales,
    productsOutOfStock,
    nearExpirationCount,
    totalBatches,
    expiringBatches,
    expiredBatches,
    totalWasteCost,
    wasteCount,
    productsWithoutBatches
  ] = await Promise.all([
    Sale.countDocuments(activeSaleMatch),
    sumField(Sale, 'total', activeSaleMatch),
    sumField(Sale, 'totalCost', activeSaleMatch),
    sumField(Expense, 'amount'),
    Product.countDocuments(),
    Product.countDocuments({ $or: [{ status: 'bajo_stock' }, { $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$minStock'] }] } }] }),
    Product.countDocuments({ expirationDate: { $lte: expirationLimit } }),
    Customer.countDocuments(),
    Customer.countDocuments({ status: 'bloqueado' }),
    Customer.countDocuments({ status: 'riesgo' }),
    Customer.countDocuments({ status: 'activo' }),
    sumField(Customer, 'currentDebt'),
    sumField(Customer, 'currentDebt', { status: { $in: ['riesgo', 'bloqueado'] } }),
    sumField(Sale, 'total', { ...activeSaleMatch, paymentStatus: 'pagado' }),
    sumField(Sale, 'total', { ...activeSaleMatch, paymentMethod: 'credito' }),
    sumField(Sale, 'total', { ...activeSaleMatch, paymentMethod: 'credito', paymentStatus: 'pendiente' }),
    sumField(Sale, 'total', { ...activeSaleMatch, createdAt: { $gte: startToday } }),
    sumField(Sale, 'total', { ...activeSaleMatch, createdAt: { $gte: startMonth } }),
    Product.countDocuments({ $or: [{ status: 'agotado' }, { stock: { $lte: 0 } }] }),
    Product.countDocuments({ expirationDate: { $lte: expirationLimit } }),
    ProductBatch.countDocuments(),
    ProductBatch.countDocuments({ availableQuantity: { $gt: 0 }, expirationDate: { $gte: new Date(), $lte: expirationLimit } }),
    ProductBatch.countDocuments({ availableQuantity: { $gt: 0 }, expirationDate: { $lt: new Date() } }),
    sumField(Waste, 'totalCost'),
    Waste.countDocuments(),
    findProductsWithoutBatches()
  ]);

  const dataMode = salesCount > 0 ? 'real' : 'reference';
  const totalSales = dataMode === 'real' ? salesTotal : BASE_SALES;
  const totalCMV = dataMode === 'real' ? cmvTotal : BASE_CMV;
  const totalExpenses = dataMode === 'real' ? expensesTotal : BASE_EXPENSES;
  const grossProfit = totalSales - totalCMV;
  const netProfit = grossProfit - totalExpenses;
  const grossMargin = safePercent(grossProfit, totalSales);
  const netMargin = safePercent(netProfit, totalSales);
  const grossMarginDecimal = grossMargin / 100;
  const breakEvenPoint = grossMarginDecimal > 0 ? totalExpenses / grossMarginDecimal : 0;
  const safetyMargin = totalSales > 0 ? ((totalSales - breakEvenPoint) / totalSales) * 100 : 0;
  const roi = safePercent(netProfit, BASE_INVESTMENT);
  const averageTicket = salesCount > 0 ? totalSales / salesCount : 0;

  return {
    totalSales: round(totalSales),
    totalCMV: round(totalCMV),
    grossProfit: round(grossProfit),
    totalExpenses: round(totalExpenses),
    netProfit: round(netProfit),
    grossMargin: round(grossMargin),
    netMargin: round(netMargin),
    breakEvenPoint: round(breakEvenPoint),
    safetyMargin: round(safetyMargin),
    roi: round(roi),
    totalProducts,
    lowStockProducts,
    expiredOrNearExpirationProducts,
    totalCustomers,
    blockedCustomers,
    riskCustomers,
    totalReceivables: round(receivables),
    totalPaidSales: round(totalPaidSales),
    totalCreditSales: round(totalCreditSales),
    pendingCreditSales: round(pendingCreditSales),
    salesCount,
    averageTicket: round(averageTicket),
    todaySales: round(todaySales),
    monthSales: round(monthSales),
    productsOutOfStock,
    nearExpirationCount,
    totalBatches,
    expiringBatches,
    expiredBatches,
    expiredBatchesWithStock: expiredBatches,
    totalWasteCost: round(totalWasteCost),
    wasteCount,
    productsWithoutSufficientBatches: productsWithoutBatches.length,
    activeCustomers,
    receivablesRiskAmount: round(receivablesRiskAmount),
    dataMode,
    hasRealSales: dataMode === 'real',
    baseInvestment: BASE_INVESTMENT
  };
};

const summary = async (req, res) => {
  try {
    return res.json(await buildSummary());
  } catch (error) {
    return res.status(500).json({ message: 'Error calculando dashboard.', error: error.message });
  }
};

const getTrendWindow = (period, from, to) => {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end);

  if (!from) {
    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (period === '7d') start.setDate(end.getDate() - 6);
    else if (period === '30d') start.setDate(end.getDate() - 29);
    else if (period === 'quarter') start.setMonth(end.getMonth() - 2, 1);
    else start.setDate(1);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const referenceSeries = (period = 'month') => {
  const points = period === '7d' ? 7 : period === 'quarter' ? 3 : 6;
  return Array.from({ length: points }).map((_, index) => {
    const factor = points === 3 ? 1 : 1 / points;
    const date = new Date();
    if (points === 3) date.setMonth(date.getMonth() - (points - index - 1), 1);
    else date.setDate(date.getDate() - (points - index - 1));
    const sales = BASE_SALES * factor;
    const cost = BASE_CMV * factor;
    const expenses = BASE_EXPENSES * factor;
    return {
      label: points === 3 ? date.toISOString().slice(0, 7) : date.toISOString().slice(0, 10),
      sales: round(sales),
      cost: round(cost),
      grossProfit: round(sales - cost),
      expenses: round(expenses),
      netProfit: round(BASE_NET_PROFIT * factor)
    };
  });
};

const trends = async (req, res) => {
  try {
    const { period = 'month', from, to } = req.query;
    const { start, end } = getTrendWindow(period, from, to);
    const groupFormat = period === 'quarter' || period === 'month' ? '%Y-%m' : '%Y-%m-%d';

    const sales = await Sale.aggregate([
      { $match: { ...activeSaleMatch, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
          sales: { $sum: '$total' },
          cost: { $sum: '$totalCost' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    if (sales.length === 0) return res.json(referenceSeries(period));

    const expenses = await Expense.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: { _id: { $dateToString: { format: groupFormat, date: '$date' } }, expenses: { $sum: '$amount' } } }
    ]);
    const expenseMap = new Map(expenses.map((item) => [item._id, item.expenses]));

    return res.json(
      sales.map((item) => {
        const expenseValue = expenseMap.get(item._id) || 0;
        return {
          label: item._id,
          sales: round(item.sales),
          cost: round(item.cost),
          grossProfit: round(item.sales - item.cost),
          expenses: round(expenseValue),
          netProfit: round(item.sales - item.cost - expenseValue)
        };
      })
    );
  } catch (error) {
    return res.status(500).json({ message: 'Error calculando tendencias.', error: error.message });
  }
};

const salesBreakdown = async (req, res) => {
  try {
    const [contado, credito, pagadas, pendientes, anuladas, receivables] = await Promise.all([
      sumField(Sale, 'total', { ...activeSaleMatch, paymentMethod: 'contado' }),
      sumField(Sale, 'total', { ...activeSaleMatch, paymentMethod: 'credito' }),
      sumField(Sale, 'total', { ...activeSaleMatch, paymentStatus: 'pagado' }),
      sumField(Sale, 'total', { ...activeSaleMatch, paymentStatus: 'pendiente' }),
      sumField(Sale, 'total', { status: 'anulada' }),
      sumField(Customer, 'currentDebt')
    ]);

    const total = contado + credito + pagadas + pendientes + anuladas + receivables;
    if (total === 0) {
      return res.json([
        { name: 'Contado', value: 50000000 },
        { name: 'Credito', value: 140000000 },
        { name: 'Pagadas', value: 50000000 },
        { name: 'Pendientes', value: 140000000 },
        { name: 'Anuladas', value: 0 },
        { name: 'Cuentas por cobrar', value: 0 }
      ]);
    }

    return res.json([
      { name: 'Contado', value: round(contado) },
      { name: 'Credito', value: round(credito) },
      { name: 'Pagadas', value: round(pagadas) },
      { name: 'Pendientes', value: round(pendientes) },
      { name: 'Anuladas', value: round(anuladas) },
      { name: 'Cuentas por cobrar', value: round(receivables) }
    ]);
  } catch (error) {
    return res.status(500).json({ message: 'Error calculando desglose de ventas.', error: error.message });
  }
};

const alerts = async (req, res) => {
  try {
    const data = await buildSummary();
    const alertsList = [];

    if (data.productsOutOfStock > 0) alertsList.push({ type: 'danger', title: 'Productos agotados', message: `Existen ${data.productsOutOfStock} productos sin stock disponible`, module: 'products' });
    if (data.lowStockProducts > 0) alertsList.push({ type: 'warning', title: 'Stock bajo', message: `${data.lowStockProducts} productos estan en nivel minimo`, module: 'products' });
    if (data.nearExpirationCount > 0) alertsList.push({ type: 'warning', title: 'Productos proximos a vencer', message: `${data.nearExpirationCount} productos vencen pronto`, module: 'products' });
    if (data.expiringBatches > 0) alertsList.push({ type: 'warning', title: 'Lotes proximos a vencer', message: `${data.expiringBatches} lotes vencen en los proximos 30 dias`, module: 'batches' });
    if (data.expiredBatches > 0) alertsList.push({ type: 'danger', title: 'Lotes vencidos con stock', message: `Existen ${data.expiredBatches} lotes vencidos con unidades disponibles. Deben gestionarse como merma, bloqueo o correccion autorizada.`, module: 'batches' });
    if (data.productsWithoutSufficientBatches > 0) alertsList.push({ type: 'warning', title: 'Productos historicos sin lotes', message: `${data.productsWithoutSufficientBatches} productos tienen stock sin lotes suficientes. Revise Limpieza de datos.`, module: 'dataCleanup' });
    if (data.totalWasteCost > BASE_CMV * 0.02) alertsList.push({ type: 'warning', title: 'Costo de merma alto', message: `Mermas acumuladas por ${round(data.totalWasteCost, 0).toLocaleString('es-CO')}`, module: 'wastes' });
    if (data.blockedCustomers > 0) alertsList.push({ type: 'danger', title: 'Clientes bloqueados', message: `${data.blockedCustomers} clientes superaron su cupo`, module: 'customers' });
    if (data.riskCustomers > 0) alertsList.push({ type: 'warning', title: 'Clientes en riesgo', message: `${data.riskCustomers} clientes estan cerca del limite de credito`, module: 'customers' });
    if (data.totalReceivables > BASE_SALES * 0.35) alertsList.push({ type: 'danger', title: 'Cartera alta', message: `Cuentas por cobrar por ${round(data.totalReceivables, 0).toLocaleString('es-CO')}`, module: 'payments' });
    if (data.netMargin < 0) alertsList.push({ type: 'danger', title: 'Margen neto negativo', message: 'La operacion esta perdiendo dinero sobre ventas', module: 'dashboard' });
    if (data.netProfit < 0) alertsList.push({ type: 'danger', title: 'Utilidad neta negativa', message: 'Los gastos y costos superan las ventas', module: 'dashboard' });
    if (data.totalExpenses > BASE_EXPENSES) alertsList.push({ type: 'warning', title: 'Gastos sobre presupuesto', message: 'Los gastos superan la referencia operacional mensual', module: 'expenses' });
    const [inventoryReconciliation, financialReconciliation] = await Promise.all([
      inventoryReconciliationData(),
      financialReconciliationData()
    ]);
    const hasReconciliationDiff =
      inventoryReconciliation.inconsistentProducts > 0 ||
      financialReconciliation.receivables.difference !== 0 ||
      financialReconciliation.payables.difference !== 0;

    if (hasReconciliationDiff) {
      const diffCount = [
        inventoryReconciliation.inconsistentProducts > 0,
        financialReconciliation.receivables.difference !== 0,
        financialReconciliation.payables.difference !== 0
      ].filter(Boolean).length;
      alertsList.push({
        type: 'danger',
        title: 'Diferencias de conciliacion',
        message: `${diffCount} diferencia(s) detectada(s). Revisa el modulo Conciliacion para diagnostico y reparacion controlada.`,
        module: 'reconciliation'
      });
    }

    if (alertsList.length === 0) {
      alertsList.push({ type: 'success', title: 'Operacion estable', message: 'No hay alertas criticas registradas en este momento', module: 'dashboard' });
    }

    return res.json(alertsList);
  } catch (error) {
    return res.status(500).json({ message: 'Error generando alertas.', error: error.message });
  }
};

module.exports = { summary, trends, salesBreakdown, alerts };
