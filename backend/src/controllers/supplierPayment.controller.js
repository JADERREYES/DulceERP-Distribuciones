const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const Supplier = require('../models/Supplier');
const SupplierPayment = require('../models/SupplierPayment');
const { createAuditLog } = require('../utils/auditLogger');
const { paginatedResponse } = require('../utils/pagination');
const { applyDateRange, escapeRegex } = require('../utils/queryFilters');

const getSupplierPayments = async (req, res) => {
  try {
    const { search, paymentMethod, supplier } = req.query;
    const filter = {};
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (supplier) filter.supplier = supplier;
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      const suppliers = await Supplier.find({ $or: [{ name: regex }, { document: regex }] }).select('_id');
      filter.$or = [{ paymentMethod: regex }, { supplier: { $in: suppliers.map((supplier) => supplier._id) } }];
    }
    applyDateRange(filter, req.query);
    return res.json(await paginatedResponse(SupplierPayment, { filter, query: req.query, sortDefault: { createdAt: -1 }, populate: ['supplier', 'createdBy', { path: 'appliedToPurchases.purchase', select: 'total paidAmount balance paymentStatus invoiceNumber createdAt' }] }));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando pagos a proveedores.', error: error.message });
  }
};

const createSupplierPayment = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { supplier: supplierId, amount, paymentMethod, note } = req.body;
    const paymentAmount = Number(amount);
    if (!supplierId || !paymentMethod || !paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Proveedor, metodo y monto mayor a 0 son obligatorios.' });
    }
    let payment;
    let updatedSupplier;
    let appliedToPurchases = [];
    await session.withTransaction(async () => {
      const supplier = await Supplier.findById(supplierId).session(session);
      if (!supplier) throw Object.assign(new Error('Proveedor no encontrado.'), { statusCode: 404 });
      if (paymentAmount > Number(supplier.currentDebt || 0)) {
        throw Object.assign(new Error('No se permite registrar sobrepago a proveedor sin modulo de anticipos.'), { statusCode: 400 });
      }

      let remaining = paymentAmount;
      const pendingPurchases = await Purchase.find({
        supplier: supplier._id,
        status: { $ne: 'anulada' },
        paymentMethod: 'credito',
        paymentStatus: 'pendiente',
        balance: { $gt: 0 }
      })
        .sort({ createdAt: 1 })
        .session(session);

      for (const purchase of pendingPurchases) {
        if (remaining <= 0) break;
        const purchaseBalance = Number(purchase.balance || 0);
        const amountApplied = Math.min(remaining, purchaseBalance);
        purchase.paidAmount = Number(purchase.paidAmount || 0) + amountApplied;
        purchase.balance = Math.max(purchaseBalance - amountApplied, 0);
        purchase.paymentStatus = purchase.balance <= 0 ? 'pagado' : 'pendiente';
        await purchase.save({ session });
        appliedToPurchases.push({ purchase: purchase._id, amountApplied });
        remaining -= amountApplied;
      }

      supplier.currentDebt = Math.max(Number(supplier.currentDebt || 0) - paymentAmount, 0);
      supplier.updatePayableStatus();
      updatedSupplier = await supplier.save({ session });
      const created = await SupplierPayment.create([{ supplier: supplier._id, amount: paymentAmount, paymentMethod, note, appliedToPurchases, createdBy: req.user?._id }], { session });
      payment = created[0];
    });
    const populated = await SupplierPayment.findById(payment._id).populate('supplier').populate('createdBy', 'name email role').populate('appliedToPurchases.purchase', 'total paidAmount balance paymentStatus invoiceNumber createdAt');
    await createAuditLog({ req, action: 'PAYMENT', module: 'supplierPayments', entityId: populated._id, entityType: 'SupplierPayment', description: 'Pago a proveedor registrado y cuenta por pagar actualizada', after: populated.toObject(), metadata: { supplier: updatedSupplier?._id, amount: paymentAmount, appliedToPurchases } });
    return res.status(201).json({ payment: populated, supplier: updatedSupplier });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error registrando pago a proveedor.', error: error.message });
  } finally {
    await session.endSession();
  }
};

module.exports = { getSupplierPayments, createSupplierPayment };
