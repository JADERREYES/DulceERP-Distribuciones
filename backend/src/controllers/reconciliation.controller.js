const Customer = require('../models/Customer');
const InventoryMovement = require('../models/InventoryMovement');
const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const Supplier = require('../models/Supplier');
const { createAuditLog } = require('../utils/auditLogger');

const round = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
};

const sumById = (items, idGetter, valueGetter) =>
  items.reduce((map, item) => {
    const id = idGetter(item)?.toString();
    if (!id) return map;
    map.set(id, round((map.get(id) || 0) + Number(valueGetter(item) || 0)));
    return map;
  }, new Map());

const buildDebtItem = ({ entity, expectedDebt, documentField = 'document', reason }) => {
  const debt = round(entity.currentDebt || 0);
  const expected = round(expectedDebt || 0);
  return {
    id: entity._id,
    name: entity.name,
    [documentField]: entity[documentField],
    debt,
    expectedDebt: expected,
    difference: round(debt - expected),
    reason
  };
};

const inventoryReconciliationData = async () => {
  const products = await Product.find().select('name stock');
  const items = [];

  for (const product of products) {
    const [movements, batches] = await Promise.all([
      InventoryMovement.find({ product: product._id }).sort({ createdAt: 1 }),
      ProductBatch.find({ product: product._id })
    ]);
    const batchCalculatedStock = batches.reduce((sum, batch) => sum + Number(batch.availableQuantity || 0), 0);
    const batchDifference = Number(product.stock || 0) - batchCalculatedStock;
    const batchStatus = batches.length === 0 ? 'partial' : batchDifference === 0 ? 'consistent' : 'inconsistent';

    if (movements.length === 0) {
      items.push({
        productId: product._id,
        name: product.name,
        currentStock: product.stock,
        kardexCalculatedStock: null,
        batchCalculatedStock: batches.length > 0 ? batchCalculatedStock : null,
        batchDifference: batches.length > 0 ? batchDifference : null,
        difference: null,
        status: batchStatus === 'inconsistent' ? 'inconsistent' : 'partial',
        note: batchStatus === 'inconsistent' ? 'Stock total del producto no coincide con suma de lotes.' : 'Sin movimientos de kardex historicos para este producto.'
      });
      continue;
    }

    const first = movements[0];
    const calculated = movements.reduce((stock, movement, index) => {
      if (index === 0) return Number(movement.newStock || 0);
      return stock + Number(movement.quantity || 0);
    }, Number(first.previousStock || 0));
    const difference = Number(product.stock || 0) - calculated;

    items.push({
      productId: product._id,
      name: product.name,
      currentStock: product.stock,
      kardexCalculatedStock: calculated,
      batchCalculatedStock: batches.length > 0 ? batchCalculatedStock : null,
      batchDifference: batches.length > 0 ? batchDifference : null,
      difference,
      status: difference === 0 && batchStatus !== 'inconsistent' ? 'consistent' : 'inconsistent',
      note: batchStatus === 'inconsistent' ? 'Stock total del producto no coincide con suma de lotes.' : undefined
    });
  }

  const consistentProducts = items.filter((item) => item.status === 'consistent').length;
  const inconsistentProducts = items.filter((item) => item.status === 'inconsistent').length;

  return {
    ok: inconsistentProducts === 0,
    mode: items.some((item) => item.status === 'partial') ? 'partial' : 'complete',
    totalProducts: products.length,
    consistentProducts,
    inconsistentProducts,
    items
  };
};

const financialReconciliationData = async () => {
  const [customers, sales, suppliers, purchases] = await Promise.all([
    Customer.find({ currentDebt: { $gt: 0 } }).select('name document currentDebt'),
    Sale.find({ status: { $ne: 'anulada' }, paymentMethod: 'credito', paymentStatus: 'pendiente' })
      .populate('customer', 'name document currentDebt')
      .select('customer total paidAmount balance paymentStatus createdAt'),
    Supplier.find({ currentDebt: { $gt: 0 } }).select('name document currentDebt'),
    Purchase.find({ status: { $ne: 'anulada' }, paymentMethod: 'credito', paymentStatus: 'pendiente' })
      .populate('supplier', 'name document currentDebt')
      .select('supplier total paidAmount balance paymentStatus invoiceNumber createdAt')
  ]);

  const customerSalesBalance = sumById(sales, (sale) => sale.customer?._id || sale.customer, (sale) => sale.balance ?? sale.total);
  const supplierPurchasesBalance = sumById(purchases, (purchase) => purchase.supplier?._id || purchase.supplier, (purchase) => purchase.balance ?? purchase.total);

  const customersDebt = round(customers.reduce((sum, customer) => sum + Number(customer.currentDebt || 0), 0));
  const pendingCreditSales = round(sales.reduce((sum, sale) => sum + Number(sale.balance ?? sale.total ?? 0), 0));
  const suppliersDebt = round(suppliers.reduce((sum, supplier) => sum + Number(supplier.currentDebt || 0), 0));
  const pendingCreditPurchases = round(purchases.reduce((sum, purchase) => sum + Number(purchase.balance ?? purchase.total ?? 0), 0));

  const customersWithDebt = customers.map((customer) =>
    buildDebtItem({
      entity: customer,
      expectedDebt: customerSalesBalance.get(customer._id.toString()) || 0,
      reason: 'Cliente con deuda registrada en maestro de cartera.'
    })
  );
  const suppliersWithDebt = suppliers.map((supplier) =>
    buildDebtItem({
      entity: supplier,
      expectedDebt: supplierPurchasesBalance.get(supplier._id.toString()) || 0,
      reason: 'Proveedor con deuda registrada en maestro de cuentas por pagar.'
    })
  );

  const unmatchedCustomerDebts = customersWithDebt
    .filter((item) => item.debt > 0 && item.expectedDebt <= 0)
    .map((item) => ({ ...item, reason: 'Cliente con deuda, pero sin ventas credito pendientes que expliquen el saldo.' }));

  const pendingSalesWithoutCustomerDebt = sales
    .filter((sale) => Number(sale.balance ?? sale.total ?? 0) > Number(sale.customer?.currentDebt || 0))
    .map((sale) => ({
      id: sale._id,
      name: sale.customer?.name || 'Cliente no disponible',
      document: sale.customer?.document,
      debt: round(sale.customer?.currentDebt || 0),
      expectedDebt: round(sale.balance ?? sale.total ?? 0),
      difference: round(Number(sale.customer?.currentDebt || 0) - Number(sale.balance ?? sale.total ?? 0)),
      reason: 'Venta credito pendiente donde el cliente no refleja deuda suficiente.'
    }));

  const unmatchedSupplierDebts = suppliersWithDebt
    .filter((item) => item.debt > 0 && item.expectedDebt <= 0)
    .map((item) => ({ ...item, reason: 'Proveedor con deuda, pero sin compras credito pendientes que expliquen el saldo.' }));

  const pendingPurchasesWithoutSupplierDebt = purchases
    .filter((purchase) => Number(purchase.balance ?? purchase.total ?? 0) > Number(purchase.supplier?.currentDebt || 0))
    .map((purchase) => ({
      id: purchase._id,
      name: purchase.supplier?.name || 'Proveedor no disponible',
      nit: purchase.supplier?.document,
      debt: round(purchase.supplier?.currentDebt || 0),
      expectedDebt: round(purchase.balance ?? purchase.total ?? 0),
      difference: round(Number(purchase.supplier?.currentDebt || 0) - Number(purchase.balance ?? purchase.total ?? 0)),
      reason: 'Compra credito pendiente donde el proveedor no refleja deuda suficiente.'
    }));

  return {
    receivables: {
      customersDebt,
      pendingCreditSales,
      difference: round(customersDebt - pendingCreditSales),
      customersWithDebt,
      unmatchedCustomerDebts,
      pendingSalesWithoutCustomerDebt
    },
    payables: {
      suppliersDebt,
      pendingCreditPurchases,
      difference: round(suppliersDebt - pendingCreditPurchases),
      suppliersWithDebt,
      unmatchedSupplierDebts,
      pendingPurchasesWithoutSupplierDebt
    }
  };
};

const possibleCauses = {
  customers: [
    'Cliente con deuda creada antes de registrar ventas credito en el sistema.',
    'Pago registrado sin relacion directa a una venta.',
    'Venta anulada o pagada pero deuda del cliente no quedo sincronizada.'
  ],
  suppliers: [
    'Proveedor con deuda creada antes de registrar compras credito.',
    'Pago parcial a proveedor genera diferencia frente a compra pendiente si la compra sigue marcada pendiente por el total.',
    'Compra credito parcialmente pagada, pero el modelo anterior solo marcaba pagado/pendiente y no manejaba saldo pendiente por compra.'
  ]
};

const buildRepairPreview = async () => {
  const [data, customers, suppliers] = await Promise.all([
    financialReconciliationData(),
    Customer.find().select('name document currentDebt'),
    Supplier.find().select('name document currentDebt')
  ]);
  const salesBalanceByCustomer = new Map();
  const purchasesBalanceBySupplier = new Map();
  const [sales, purchases] = await Promise.all([
    Sale.find({ status: { $ne: 'anulada' }, paymentMethod: 'credito', paymentStatus: 'pendiente' }).select('customer balance total'),
    Purchase.find({ status: { $ne: 'anulada' }, paymentMethod: 'credito', paymentStatus: 'pendiente' }).select('supplier balance total')
  ]);
  sales.forEach((sale) => {
    const id = sale.customer?.toString();
    if (id) salesBalanceByCustomer.set(id, round((salesBalanceByCustomer.get(id) || 0) + Number(sale.balance ?? sale.total ?? 0)));
  });
  purchases.forEach((purchase) => {
    const id = purchase.supplier?.toString();
    if (id) purchasesBalanceBySupplier.set(id, round((purchasesBalanceBySupplier.get(id) || 0) + Number(purchase.balance ?? purchase.total ?? 0)));
  });
  return {
    customersFixes: customers
      .map((customer) => ({
        customerId: customer._id,
        name: customer.name,
        currentDebt: round(customer.currentDebt || 0),
        expectedDebt: round(salesBalanceByCustomer.get(customer._id.toString()) || 0)
      }))
      .map((item) => ({
        ...item,
        difference: round(item.currentDebt - item.expectedDebt),
        proposedAction: `Ajustar currentDebt de ${item.currentDebt} a ${item.expectedDebt}`
      }))
      .filter((item) => item.difference !== 0),
    suppliersFixes: suppliers
      .map((supplier) => ({
        supplierId: supplier._id,
        name: supplier.name,
        currentDebt: round(supplier.currentDebt || 0),
        expectedDebt: round(purchasesBalanceBySupplier.get(supplier._id.toString()) || 0)
      }))
      .map((item) => ({
        ...item,
        difference: round(item.currentDebt - item.expectedDebt),
        proposedAction: `Ajustar currentDebt de ${item.currentDebt} a ${item.expectedDebt}`
      }))
      .filter((item) => item.difference !== 0),
    summary: {
      receivablesDifference: data.receivables.difference,
      payablesDifference: data.payables.difference
    }
  };
};

const inventory = async (req, res) => {
  try {
    const data = await inventoryReconciliationData();
    await createAuditLog({ req, action: 'READ', module: 'reconciliation', description: 'Consulta de conciliacion de inventario', metadata: { inconsistentProducts: data.inconsistentProducts, mode: data.mode } });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: 'Error conciliando inventario.', error: error.message });
  }
};

const financial = async (req, res) => {
  try {
    const data = await financialReconciliationData();
    await createAuditLog({ req, action: 'READ', module: 'reconciliation', description: 'Consulta de conciliacion financiera', metadata: data });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: 'Error conciliando informacion financiera.', error: error.message });
  }
};

const financialDetails = async (req, res) => {
  try {
    const data = await financialReconciliationData();
    await createAuditLog({ req, action: 'READ', module: 'reconciliation', description: 'Consulta de diagnostico financiero de conciliacion', metadata: { receivablesDifference: data.receivables.difference, payablesDifference: data.payables.difference } });
    return res.json({
      customers: {
        summary: {
          customersDebt: data.receivables.customersDebt,
          pendingCreditSales: data.receivables.pendingCreditSales,
          difference: data.receivables.difference
        },
        unmatchedCustomerDebts: data.receivables.unmatchedCustomerDebts,
        pendingSalesWithoutCustomerDebt: data.receivables.pendingSalesWithoutCustomerDebt,
        possibleCauses: possibleCauses.customers
      },
      suppliers: {
        summary: {
          suppliersDebt: data.payables.suppliersDebt,
          pendingCreditPurchases: data.payables.pendingCreditPurchases,
          difference: data.payables.difference
        },
        unmatchedSupplierDebts: data.payables.unmatchedSupplierDebts,
        pendingPurchasesWithoutSupplierDebt: data.payables.pendingPurchasesWithoutSupplierDebt,
        possibleCauses: possibleCauses.suppliers
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando diagnostico financiero.', error: error.message });
  }
};

const repairPreview = async (req, res) => {
  try {
    const preview = await buildRepairPreview();
    await createAuditLog({ req, action: 'READ', module: 'reconciliation', description: 'Vista previa de reparacion financiera', metadata: { customersFixes: preview.customersFixes.length, suppliersFixes: preview.suppliersFixes.length } });
    return res.json(preview);
  } catch (error) {
    return res.status(500).json({ message: 'Error generando vista previa de reparacion.', error: error.message });
  }
};

const repairApply = async (req, res) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({ message: 'Debe enviar confirm: true para aplicar la reparacion controlada.' });
  }

  const session = await require('mongoose').startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const preview = await buildRepairPreview();
      const customerChanges = [];
      const supplierChanges = [];

      for (const fix of preview.customersFixes) {
        const customer = await Customer.findById(fix.customerId).session(session);
        if (!customer) continue;
        const before = customer.toObject();
        customer.currentDebt = Math.max(Number(fix.expectedDebt || 0), 0);
        customer.updateCreditStatus();
        await customer.save({ session });
        customerChanges.push({ customerId: customer._id, name: customer.name, before: fix.currentDebt, after: customer.currentDebt });
        await createAuditLog({ req, action: 'UPDATE', module: 'reconciliation', entityId: customer._id, entityType: 'Customer', description: 'Saldo de cliente ajustado por reparacion de conciliacion financiera', before, after: customer.toObject(), metadata: fix });
      }

      for (const fix of preview.suppliersFixes) {
        const supplier = await Supplier.findById(fix.supplierId).session(session);
        if (!supplier) continue;
        const before = supplier.toObject();
        supplier.currentDebt = Math.max(Number(fix.expectedDebt || 0), 0);
        supplier.updatePayableStatus();
        await supplier.save({ session });
        supplierChanges.push({ supplierId: supplier._id, name: supplier.name, before: fix.currentDebt, after: supplier.currentDebt });
        await createAuditLog({ req, action: 'UPDATE', module: 'reconciliation', entityId: supplier._id, entityType: 'Supplier', description: 'Saldo de proveedor ajustado por reparacion de conciliacion financiera', before, after: supplier.toObject(), metadata: fix });
      }

      result = { customersUpdated: customerChanges.length, suppliersUpdated: supplierChanges.length, customerChanges, supplierChanges };
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: 'Error aplicando reparacion financiera.', error: error.message });
  } finally {
    await session.endSession();
  }
};

module.exports = { inventory, financial, financialDetails, repairPreview, repairApply, inventoryReconciliationData, financialReconciliationData };
