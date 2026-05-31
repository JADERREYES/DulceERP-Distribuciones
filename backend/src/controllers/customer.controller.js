const Customer = require('../models/Customer');
const { paginatedResponse } = require('../utils/pagination');
const { createAuditLog } = require('../utils/auditLogger');

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
    const payload = { ...req.body };
    delete payload.status;

    for (const field of ['creditLimit', 'currentDebt', 'paymentTermDays']) {
      if (payload[field] !== undefined && Number(payload[field]) < 0) {
        return res.status(400).json({ message: 'Cupo, deuda y plazo no pueden ser negativos.' });
      }
    }

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
    const payload = { ...req.body };
    delete payload.status;

    for (const field of ['creditLimit', 'currentDebt', 'paymentTermDays']) {
      if (payload[field] !== undefined && Number(payload[field]) < 0) {
        return res.status(400).json({ message: 'Cupo, deuda y plazo no pueden ser negativos.' });
      }
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado.' });
    const before = customer.toObject();

    Object.assign(customer, payload);
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

module.exports = { getCustomers, createCustomer, getCustomerById, updateCustomer, deleteCustomer };
