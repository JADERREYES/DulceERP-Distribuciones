const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const InventoryMovement = require('../models/InventoryMovement');
const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const Sale = require('../models/Sale');
const { createAuditLog } = require('../utils/auditLogger');
const { paginatedResponse } = require('../utils/pagination');

const getSales = async (req, res) => {
  try {
    const { search, status, paymentMethod, paymentStatus } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const customers = await Customer.find({ $or: [{ name: regex }, { document: regex }] }).select('_id');
      filter.$or = [{ customer: { $in: customers.map((customer) => customer._id) } }];
      if (mongoose.Types.ObjectId.isValid(search)) filter.$or.push({ _id: search });
    }

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
    const { customer: customerId, items, paymentMethod, routeZone } = req.body;

    if (!customerId || !Array.isArray(items) || items.length === 0 || !paymentMethod || !routeZone) {
      return res.status(400).json({ message: 'Cliente, items, metodo de pago y zona son obligatorios.' });
    }

    if (!['contado', 'credito'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Metodo de pago invalido. Use contado o credito.' });
    }

    let createdSale;

    await session.withTransaction(async () => {
      const customer = await Customer.findById(customerId).session(session);
      if (!customer) {
        const error = new Error('Cliente no encontrado.');
        error.statusCode = 404;
        throw error;
      }

      customer.updateCreditStatus();

      if (paymentMethod === 'credito' && customer.status === 'bloqueado') {
        const error = new Error('No se permite venta a credito para clientes bloqueados.');
        error.statusCode = 400;
        throw error;
      }

      const saleItems = [];
      const pendingMovements = [];
      let total = 0;
      let totalCost = 0;

      for (const item of items) {
        const product = await Product.findById(item.product).session(session);
        if (!product) {
          const error = new Error(`Producto no encontrado: ${item.product}`);
          error.statusCode = 404;
          throw error;
        }

        const quantity = Number(item.quantity);
        if (!quantity || quantity < 1) {
          const error = new Error(`Cantidad invalida para ${product.name}.`);
          error.statusCode = 400;
          throw error;
        }

        if (product.stock < quantity) {
          const error = new Error(`Stock insuficiente para ${product.name}. Disponible: ${product.stock}`);
          error.statusCode = 400;
          throw error;
        }

        const unitPrice = Number(item.unitPrice ?? product.salePrice);
        const unitCost = Number(product.unitCost);
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          const error = new Error(`Precio de venta invalido para ${product.name}.`);
          error.statusCode = 400;
          throw error;
        }

        const subtotal = quantity * unitPrice;
        const costSubtotal = quantity * unitCost;
        let remainingQuantity = quantity;
        const assignedBatches = [];
        const batches = await ProductBatch.find({
          product: product._id,
          availableQuantity: { $gt: 0 },
          expirationDate: { $gte: new Date() },
          status: { $nin: ['vencido', 'agotado'] }
        })
          .sort({ expirationDate: 1, createdAt: 1 })
          .session(session);

        for (const batch of batches) {
          if (remainingQuantity <= 0) break;
          const quantityFromBatch = Math.min(remainingQuantity, Number(batch.availableQuantity || 0));
          const previousBatchQuantity = Number(batch.availableQuantity || 0);
          batch.availableQuantity = previousBatchQuantity - quantityFromBatch;
          batch.updateStatus();
          await batch.save({ session });
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
            user: req.user?._id
          });
          remainingQuantity -= quantityFromBatch;
        }

        if (remainingQuantity > 0) {
          const error = new Error('No hay lotes disponibles suficientes para este producto.');
          error.statusCode = 400;
          throw error;
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

      if (paymentMethod === 'credito') {
        const projectedDebt = Number(customer.currentDebt || 0) + total;
        if (projectedDebt > Number(customer.creditLimit || 0)) {
          const error = new Error('La venta a credito supera el cupo disponible del cliente.');
          error.statusCode = 400;
          throw error;
        }

        customer.currentDebt = projectedDebt;
        customer.updateCreditStatus();
        await customer.save({ session });
      }

      const sale = await Sale.create(
        [
          {
            customer: customer._id,
            items: saleItems,
            total,
            totalCost,
            grossProfit: total - totalCost,
            paymentMethod,
            paymentStatus: paymentMethod === 'credito' ? 'pendiente' : 'pagado',
            paidAmount: paymentMethod === 'credito' ? 0 : total,
            balance: paymentMethod === 'credito' ? total : 0,
            routeZone,
            seller: req.user?._id,
            status: 'activa'
          }
        ],
        { session }
      );

      createdSale = sale[0];
      if (pendingMovements.length > 0) {
        await InventoryMovement.create(pendingMovements.map((movement) => ({ ...movement, referenceId: createdSale._id.toString() })), { session });
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
    return res.status(error.statusCode || 400).json({ message: 'Error registrando venta.', error: error.message });
  } finally {
    await session.endSession();
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

module.exports = { getSales, createSale, getSaleById, cancelSale };
