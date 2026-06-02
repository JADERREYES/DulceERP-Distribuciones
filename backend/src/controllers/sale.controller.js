const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const InventoryMovement = require('../models/InventoryMovement');
const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const Sale = require('../models/Sale');
const { createAuditLog } = require('../utils/auditLogger');
const { paginatedResponse } = require('../utils/pagination');
const { applyDateRange, escapeRegex } = require('../utils/queryFilters');

const saleValidationError = (message, field, details = {}, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.field = field;
  error.details = details;
  return error;
};

const errorPayload = (error) => ({
  message: error.message || 'No se pudo procesar la venta.',
  field: error.field,
  details: error.details || {}
});

const logSalePayload = (req) => {
  if (process.env.NODE_ENV === 'production') return;
  const { customer, items, paymentMethod, routeZone } = req.body || {};
  console.log('Payload venta recibido:', {
    customer,
    itemsLength: Array.isArray(items) ? items.length : 0,
    paymentMethod,
    routeZone,
    seller: req.user?._id?.toString?.() || req.user?.id
  });
};

const validateSalePayload = async ({ body, user, session, mutate = false }) => {
  const { customer: customerId, items, paymentMethod, routeZone } = body || {};

  if (!customerId) throw saleValidationError('Debe seleccionar un cliente.', 'customer');
  if (!Array.isArray(items) || items.length === 0) throw saleValidationError('Debe agregar al menos un producto a la venta.', 'items');
  if (!paymentMethod) throw saleValidationError('Debe seleccionar una forma de pago.', 'paymentMethod');
  if (!['contado', 'credito'].includes(paymentMethod)) throw saleValidationError('Metodo de pago invalido. Use contado o credito.', 'paymentMethod', { received: paymentMethod });
  if (!routeZone || !String(routeZone).trim()) throw saleValidationError('Debe seleccionar zona o ruta.', 'routeZone');

  const customerQuery = Customer.findById(customerId);
  if (session) customerQuery.session(session);
  const customer = await customerQuery;
  if (!customer) throw saleValidationError('El cliente seleccionado no existe.', 'customer', { customer: customerId });

  customer.updateCreditStatus();

  if (paymentMethod === 'credito' && customer.status === 'bloqueado') {
    throw saleValidationError('Cliente bloqueado para ventas a credito.', 'customer', { status: customer.status });
  }

  const saleItems = [];
  const pendingMovements = [];
  let total = 0;
  let totalCost = 0;

  for (const item of items) {
    if (!item?.product) throw saleValidationError('Debe seleccionar un producto.', 'items.product');

    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw saleValidationError('La cantidad debe ser mayor que cero.', 'items.quantity', { product: item.product, quantity: item.quantity });
    }

    const productQuery = Product.findById(item.product);
    if (session) productQuery.session(session);
    const product = await productQuery;
    if (!product) throw saleValidationError('Producto no encontrado.', 'items.product', { product: item.product });

    if (Number(product.stock || 0) < quantity) {
      throw saleValidationError(`Stock insuficiente para el producto ${product.name}.`, 'items.quantity', {
        product: product._id,
        productName: product.name,
        requestedQuantity: quantity,
        availableStock: product.stock
      });
    }

    const unitPrice = Number(item.unitPrice ?? product.salePrice);
    const unitCost = Number(product.unitCost);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw saleValidationError('El precio de venta debe ser mayor que cero.', 'items.unitPrice', { product: product._id, productName: product.name });
    }

    const subtotal = quantity * unitPrice;
    const costSubtotal = quantity * unitCost;
    let remainingQuantity = quantity;
    const assignedBatches = [];

    const allBatchesQuery = ProductBatch.find({ product: product._id, availableQuantity: { $gt: 0 } }).select('_id');
    if (session) allBatchesQuery.session(session);
    const allBatches = await allBatchesQuery.lean();

    if (Number(product.stock || 0) > 0 && allBatches.length === 0) {
      throw saleValidationError(`El producto ${product.name} tiene stock historico, pero no tiene lotes disponibles. Cargue un lote real en Limpieza de datos.`, 'items.product', {
        product: product._id,
        productName: product.name,
        stock: product.stock
      });
    }

    const batchesQuery = ProductBatch.find({
      product: product._id,
      availableQuantity: { $gt: 0 },
      expirationDate: { $gte: new Date() },
      status: { $nin: ['vencido', 'agotado', 'bloqueado'] }
    }).sort({ expirationDate: 1, createdAt: 1 });
    if (session) batchesQuery.session(session);
    const batches = await batchesQuery;

    if (batches.length === 0 && allBatches.length > 0) {
      throw saleValidationError(`El producto ${product.name} tiene lotes vencidos o no vigentes. Cargue o habilite un lote vigente para vender.`, 'items.product', {
        product: product._id,
        productName: product.name,
        availableBatchesWithStock: allBatches.length
      });
    }

    for (const batch of batches) {
      if (remainingQuantity <= 0) break;
      const quantityFromBatch = Math.min(remainingQuantity, Number(batch.availableQuantity || 0));
      const previousBatchQuantity = Number(batch.availableQuantity || 0);

      if (mutate) {
        batch.availableQuantity = previousBatchQuantity - quantityFromBatch;
        batch.updateStatus();
        await batch.save({ session });
      }

      assignedBatches.push({
        batch: batch._id,
        batchNumber: batch.batchNumber,
        quantity: quantityFromBatch,
        expirationDate: batch.expirationDate
      });
      pendingMovements.push({
        product: product._id,
        type: 'salida_venta',
        quantity: -quantityFromBatch,
        unitCost,
        previousStock: null,
        newStock: null,
        referenceType: 'Sale',
        batch: batch._id,
        batchNumber: batch.batchNumber,
        description: 'Salida por venta FEFO',
        user: user?._id
      });
      remainingQuantity -= quantityFromBatch;
    }

    if (remainingQuantity > 0) {
      throw saleValidationError(`No hay lotes disponibles suficientes para el producto ${product.name}.`, 'items', {
        product: product._id,
        productName: product.name,
        requestedQuantity: quantity,
        assignedQuantity: quantity - remainingQuantity
      });
    }

    saleItems.push({
      product: product._id,
      quantity,
      unitPrice,
      unitCost,
      subtotal,
      costSubtotal,
      batches: assignedBatches
    });

    total += subtotal;
    totalCost += costSubtotal;

    if (mutate) {
      product.stock -= quantity;
      product.updateInventoryStatus();
      await product.save({ session });
      pendingMovements
        .filter((movement) => movement.product.toString() === product._id.toString() && movement.previousStock === null)
        .forEach((movement) => {
          movement.previousStock = product.stock + quantity;
          movement.newStock = product.stock;
        });
    }
  }

  if (paymentMethod === 'credito') {
    const projectedDebt = Number(customer.currentDebt || 0) + total;
    if (projectedDebt > Number(customer.creditLimit || 0)) {
      throw saleValidationError('La venta supera el cupo de credito del cliente.', 'customer.creditLimit', {
        currentDebt: customer.currentDebt,
        creditLimit: customer.creditLimit,
        saleTotal: total,
        projectedDebt
      });
    }

    if (mutate) {
      customer.currentDebt = projectedDebt;
      customer.updateCreditStatus();
      await customer.save({ session });
    }
  }

  return {
    customer,
    saleItems,
    pendingMovements,
    total,
    totalCost,
    grossProfit: total - totalCost,
    summary: {
      customer: customer.name,
      itemsCount: saleItems.length,
      total,
      estimatedCost: totalCost,
      estimatedGrossProfit: total - totalCost,
      batchesAvailable: saleItems.every((item) => item.batches?.length > 0)
    }
  };
};

const getSales = async (req, res) => {
  try {
    const { search, status, paymentMethod, paymentStatus, customer } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (customer) filter.customer = customer;
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      const customers = await Customer.find({ $or: [{ name: regex }, { document: regex }] }).select('_id');
      filter.$or = [{ customer: { $in: customers.map((customer) => customer._id) } }];
      if (mongoose.Types.ObjectId.isValid(search)) filter.$or.push({ _id: search });
    }
    applyDateRange(filter, req.query);

    return res.json(
      await paginatedResponse(Sale, {
        filter,
        query: req.query,
        sortDefault: { createdAt: -1 },
        populate: [
          { path: 'customer', select: 'name document status currentDebt creditLimit' },
          { path: 'items.product', select: 'name sku stock status' },
          { path: 'items.batches.batch', select: 'batchNumber availableQuantity expirationDate status' },
          { path: 'seller', select: 'name email' }
        ]
      })
    );
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando ventas.', error: error.message });
  }
};

const createSale = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    logSalePayload(req);
    const { paymentMethod, routeZone } = req.body;

    let createdSale;
    let saleData;

    await session.withTransaction(async () => {
      saleData = await validateSalePayload({ body: req.body, user: req.user, session, mutate: true });

      const sale = await Sale.create(
        [
          {
            customer: saleData.customer._id,
            items: saleData.saleItems,
            total: saleData.total,
            totalCost: saleData.totalCost,
            grossProfit: saleData.grossProfit,
            paymentMethod,
            paymentStatus: paymentMethod === 'credito' ? 'pendiente' : 'pagado',
            paidAmount: paymentMethod === 'credito' ? 0 : saleData.total,
            balance: paymentMethod === 'credito' ? saleData.total : 0,
            routeZone,
            seller: req.user?._id,
            status: 'activa'
          }
        ],
        { session }
      );

      createdSale = sale[0];
      if (saleData.pendingMovements.length > 0) {
        await InventoryMovement.create(saleData.pendingMovements.map((movement) => ({ ...movement, referenceId: createdSale._id.toString() })), { session });
      }
    });

    const populatedSale = await Sale.findById(createdSale._id)
      .populate('customer', 'name document status currentDebt creditLimit')
      .populate('items.product', 'name sku stock status')
      .populate('items.batches.batch', 'batchNumber availableQuantity expirationDate status')
      .populate('seller', 'name email');

    await createAuditLog({
      req,
      action: 'CREATE',
      module: 'sales',
      entityId: populatedSale._id,
      entityType: 'Sale',
      description: `Venta creada por valor de $${Number(populatedSale.total).toLocaleString('es-CO')}`,
      after: populatedSale.toObject(),
      metadata: { total: populatedSale.total, items: populatedSale.items.length, paymentMethod }
    });

    return res.status(201).json(populatedSale);
  } catch (error) {
    return res.status(error.statusCode || 400).json(errorPayload(error));
  } finally {
    await session.endSession();
  }
};

const validateSale = async (req, res) => {
  try {
    logSalePayload(req);
    const saleData = await validateSalePayload({ body: req.body, user: req.user, mutate: false });
    return res.json({
      ok: true,
      message: 'La venta es valida y puede registrarse.',
      summary: saleData.summary
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      ok: false,
      ...errorPayload(error)
    });
  }
};

const getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('customer')
      .populate('items.product')
      .populate('items.batches.batch')
      .populate('seller', 'name email role');

    if (!sale) return res.status(404).json({ message: 'Venta no encontrada.' });
    return res.json(sale);
  } catch (error) {
    return res.status(400).json({ message: 'Error consultando venta.', error: error.message });
  }
};

const cancelSale = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    let canceledSale;
    let updatedCustomer = null;
    const updatedProducts = [];

    await session.withTransaction(async () => {
      const sale = await Sale.findById(req.params.id).session(session);
      if (!sale) {
        const error = new Error('Venta no encontrada.');
        error.statusCode = 404;
        throw error;
      }

      if (sale.status === 'anulada') {
        const error = new Error('La venta ya esta anulada.');
        error.statusCode = 400;
        throw error;
      }

      sale.status = 'anulada';

      for (const item of sale.items) {
        const product = await Product.findById(item.product).session(session);
        if (product) {
          product.stock += item.quantity;
          product.updateInventoryStatus();
          await product.save({ session });
          updatedProducts.push(product);
          if (item.batches?.length > 0) {
            for (const usedBatch of item.batches) {
              const batch = await ProductBatch.findById(usedBatch.batch).session(session);
              if (!batch) continue;
              batch.availableQuantity = Number(batch.availableQuantity || 0) + Number(usedBatch.quantity || 0);
              batch.updateStatus();
              await batch.save({ session });
              await InventoryMovement.create([{ product: product._id, type: 'devolucion_anulacion', quantity: usedBatch.quantity, unitCost: item.unitCost, previousStock: product.stock - item.quantity, newStock: product.stock, referenceType: 'Sale', referenceId: sale._id.toString(), batch: batch._id, batchNumber: batch.batchNumber, description: 'Devolucion por anulacion de venta a lote', user: req.user?._id }], { session });
            }
          } else {
            await InventoryMovement.create([{ product: product._id, type: 'devolucion_anulacion', quantity: item.quantity, unitCost: item.unitCost, previousStock: product.stock - item.quantity, newStock: product.stock, referenceType: 'Sale', referenceId: sale._id.toString(), description: 'Devolucion por anulacion de venta', user: req.user?._id }], { session });
          }
        }
      }

      if (sale.paymentMethod === 'credito' && sale.paymentStatus === 'pendiente') {
        const customer = await Customer.findById(sale.customer).session(session);
        if (customer) {
          customer.currentDebt = Math.max(Number(customer.currentDebt || 0) - Number(sale.balance || 0), 0);
          customer.updateCreditStatus();
          updatedCustomer = await customer.save({ session });
        }
      }

      sale.balance = 0;
      canceledSale = await sale.save({ session });
    });

    const populatedSale = await Sale.findById(canceledSale._id)
      .populate('customer', 'name document status currentDebt creditLimit')
      .populate('items.product', 'name sku stock status')
      .populate('items.batches.batch', 'batchNumber availableQuantity expirationDate status')
      .populate('seller', 'name email');

    await createAuditLog({
      req,
      action: 'CANCEL',
      module: 'sales',
      entityId: populatedSale._id,
      entityType: 'Sale',
      description: 'Venta anulada y stock devuelto al inventario',
      after: populatedSale.toObject(),
      metadata: { returnedProducts: updatedProducts.length, customerUpdated: Boolean(updatedCustomer) }
      ,
      before: { warning: 'Si existieron pagos asociados a esta venta, no se alteraron por falta de relacion directa pago-venta.' }
    });

    return res.json({
      sale: populatedSale,
      products: updatedProducts,
      customer: updatedCustomer
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error anulando venta.', error: error.message });
  } finally {
    await session.endSession();
  }
};

module.exports = { getSales, createSale, getSaleById, cancelSale, validateSale };
