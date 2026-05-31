const Customer = require('../models/Customer');
const Payment = require('../models/Payment');
const Sale = require('../models/Sale');
const { paginatedResponse } = require('../utils/pagination');
const { createAuditLog } = require('../utils/auditLogger');

const editableFields = ['name', 'document', 'phone', 'email', 'type', 'zone', 'creditLimit', 'paymentTermDays'];

const buildCustomerPayload = (body) => {
  const payload = {};
  for (const field of editableFields) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  return payload;
};

const validateCustomerPayload = (payload, currentDebt = 0) => {
  if (payload.creditLimit !== undefined && Number(payload.creditLimit) < 0) {
    return 'El cupo de credito no puede ser negativo.';
  }
  if (payload.paymentTermDays !== undefined && Number(payload.paymentTermDays) < 0) {
    return 'El plazo de pago no puede ser negativo.';
  }
  if (payload.creditLimit !== undefined && Number(payload.creditLimit) < Number(currentDebt || 0)) {
    return 'El cupo no puede ser menor que la deuda actual del cliente.';
  }
  return '';
};

const getCustomers = async (req, res) => {
  try {
    const { search, status, type, zone } = req.query;
    const filter = {};
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { document: regex }, { phone: regex }, { email: regex }, { zone: regex }];
    }
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (zone) filter.zone = zone;
    return res.json(await paginatedResponse(Customer, { filter, query: req.query, sortDefault: { createdAt: -1 } }));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando clientes.', error: error.message });
  }
};

const createCustomer = async (req, res) => {
  try {
    const { name, document, type, zone } = req.body;
    if (!name || !document || !type || !zone) {
      return res.status(400).json({ message: 'Nombre, documento, tipo y zona son obligatorios.' });
    }
    const payload = buildCustomerPayload(req.body);
    const validationMessage = validateCustomerPayload(payload, 0);
    if (validationMessage) return res.status(400).json({ message: validationMessage });

    const customer = await Customer.create(payload);
    await createAuditLog({
      req,
      action: 'CREATE',
      module: 'customers',
      entityId: customer._id,
      entityType: 'Customer',
      description: 'Cliente creado',
      after: customer.toObject()
    });
    return res.status(201).json(customer);
  } catch (error) {
    return res.status(400).json({ message: 'Error creando cliente.', error: error.message });
  }
};

const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado.' });
    return res.json(customer);
  } catch (error) {
    return res.status(400).json({ message: 'Error consultando cliente.', error: error.message });
  }
};

const updateCustomer = async (req, res) => {
  try {
    if (Object.prototype.hasOwnProperty.call(req.body, 'currentDebt')) {
      return res.status(400).json({ message: 'La deuda del cliente no se edita manualmente. Se actualiza por ventas y pagos.' });
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado.' });
    const before = customer.toObject();
    const payload = buildCustomerPayload(req.body);
    const validationMessage = validateCustomerPayload(payload, customer.currentDebt);
    if (validationMessage) return res.status(400).json({ message: validationMessage });

    Object.assign(customer, payload);
    customer.updateCreditStatus();
    await customer.save();

    await createAuditLog({
      req,
      action: 'UPDATE',
      module: 'customers',
      entityId: customer._id,
      entityType: 'Customer',
      description: 'Cliente actualizado',
      before,
      after: customer.toObject()
    });

    return res.json(customer);
  } catch (error) {
    return res.status(400).json({ message: 'Error actualizando cliente.', error: error.message });
  }
};

const getCustomerDebtDetail = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado.' });

    const [pendingSales, payments] = await Promise.all([
      Sale.find({ customer: customer._id, status: 'activa', paymentMethod: 'credito', paymentStatus: 'pendiente' })
        .select('createdAt total paidAmount balance paymentStatus')
        .sort({ createdAt: 1 })
        .lean(),
      Payment.find({ customer: customer._id })
        .populate('appliedToSales.sale', 'createdAt total balance paymentStatus')
        .select('createdAt amount paymentMethod note appliedToSales')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
    ]);

    const pendingSalesBalance = pendingSales.reduce((sum, sale) => sum + Number(sale.balance || 0), 0);

    return res.json({
      customer: {
        _id: customer._id,
        name: customer.name,
        document: customer.document,
        currentDebt: customer.currentDebt,
        creditLimit: customer.creditLimit,
        status: customer.status
      },
      pendingSales: pendingSales.map((sale) => ({
        _id: sale._id,
        date: sale.createdAt,
        total: sale.total,
        paidAmount: sale.paidAmount,
        balance: sale.balance,
        paymentStatus: sale.paymentStatus
      })),
      payments: payments.map((payment) => ({
        _id: payment._id,
        date: payment.createdAt,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        note: payment.note,
        appliedToSales: payment.appliedToSales
      })),
      summary: {
        currentDebt: customer.currentDebt,
        pendingSalesBalance,
        difference: Number(customer.currentDebt || 0) - pendingSalesBalance
      }
    });
  } catch (error) {
    return res.status(400).json({ message: 'Error consultando detalle de cartera del cliente.', error: error.message });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado.' });
    await createAuditLog({
      req,
      action: 'DELETE',
      module: 'customers',
      entityId: customer._id,
      entityType: 'Customer',
      description: 'Cliente eliminado',
      before: customer.toObject()
    });
    return res.json({ message: 'Cliente eliminado correctamente.' });
  } catch (error) {
    return res.status(400).json({ message: 'Error eliminando cliente.', error: error.message });
  }
};

module.exports = { getCustomers, createCustomer, getCustomerById, getCustomerDebtDetail, updateCustomer, deleteCustomer };
