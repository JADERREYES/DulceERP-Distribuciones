const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Payment = require('../models/Payment');
const Sale = require('../models/Sale');
const { createAuditLog } = require('../utils/auditLogger');
const { paginatedResponse } = require('../utils/pagination');
const { applyDateRange, escapeRegex } = require('../utils/queryFilters');

const getPayments = async (req, res) => {
  try {
    const { search, paymentMethod, customer } = req.query;
    const filter = {};
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (customer) filter.customer = customer;
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      const customers = await Customer.find({ $or: [{ name: regex }, { document: regex }] }).select('_id');
      filter.$or = [{ paymentMethod: regex }, { customer: { $in: customers.map((customer) => customer._id) } }];
    }
    applyDateRange(filter, req.query);

    return res.json(
      await paginatedResponse(Payment, {
        filter,
        query: req.query,
        sortDefault: { createdAt: -1 },
        populate: ['customer', { path: 'appliedToSales.sale', select: 'total paidAmount balance paymentStatus createdAt' }]
      })
    );
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando pagos.', error: error.message });
  }
};

const createPayment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { customer: customerId, amount, paymentMethod, note } = req.body;
    const paymentAmount = Number(amount);

    if (!customerId || !paymentMethod || !paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Cliente, metodo de pago y valor mayor a 0 son obligatorios.' });
    }

    let payment;
    let updatedCustomer;
    let appliedToSales = [];

    await session.withTransaction(async () => {
      const customer = await Customer.findById(customerId).session(session);
      if (!customer) {
        const error = new Error('Cliente no encontrado.');
        error.statusCode = 404;
        throw error;
      }
      if (paymentAmount > Number(customer.currentDebt || 0)) {
        const error = new Error('No se permite registrar sobrepago sin modulo de anticipos.');
        error.statusCode = 400;
        throw error;
      }

      let remaining = paymentAmount;
      const pendingSales = await Sale.find({
        customer: customer._id,
        status: { $ne: 'anulada' },
        paymentMethod: 'credito',
        paymentStatus: 'pendiente',
        balance: { $gt: 0 }
      })
        .sort({ createdAt: 1 })
        .session(session);

      for (const sale of pendingSales) {
        if (remaining <= 0) break;
        const saleBalance = Number(sale.balance || 0);
        const amountApplied = Math.min(remaining, saleBalance);
        sale.paidAmount = Number(sale.paidAmount || 0) + amountApplied;
        sale.balance = Math.max(saleBalance - amountApplied, 0);
        sale.paymentStatus = sale.balance <= 0 ? 'pagado' : 'pendiente';
        await sale.save({ session });
        appliedToSales.push({ sale: sale._id, amountApplied });
        remaining -= amountApplied;
      }

      customer.currentDebt = Math.max(Number(customer.currentDebt || 0) - paymentAmount, 0);
      customer.updateCreditStatus();
      updatedCustomer = await customer.save({ session });

      payment = await Payment.create(
        [
          {
            customer: customer._id,
            amount: paymentAmount,
            paymentMethod,
            note,
            appliedToSales
          }
        ],
        { session }
      );
    });

    const populatedPayment = await Payment.findById(payment[0]._id)
      .populate('customer', 'name document currentDebt status')
      .populate('appliedToSales.sale', 'total paidAmount balance paymentStatus createdAt');

    await createAuditLog({
      req,
      action: 'PAYMENT',
      module: 'payments',
      entityId: populatedPayment._id,
      entityType: 'Payment',
      description: 'Pago registrado y cartera actualizada',
      after: populatedPayment.toObject(),
      metadata: { customer: updatedCustomer?._id, amount: paymentAmount, appliedToSales }
    });

    return res.status(201).json({ payment: populatedPayment, customer: updatedCustomer });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error registrando pago.', error: error.message });
  } finally {
    await session.endSession();
  }
};

const getPaymentsByCustomer = async (req, res) => {
  try {
    const payments = await Payment.find({ customer: req.params.customerId })
      .populate('customer', 'name document currentDebt status')
      .populate('appliedToSales.sale', 'total paidAmount balance paymentStatus createdAt')
      .sort({ createdAt: -1 });

    return res.json(payments);
  } catch (error) {
    return res.status(400).json({ message: 'Error consultando pagos del cliente.', error: error.message });
  }
};

module.exports = { getPayments, createPayment, getPaymentsByCustomer };
