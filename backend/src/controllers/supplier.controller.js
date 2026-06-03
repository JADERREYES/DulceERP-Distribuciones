const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const SupplierPayment = require('../models/SupplierPayment');
const { createAuditLog } = require('../utils/auditLogger');
const { paginatedResponse } = require('../utils/pagination');
const { applyDateRange } = require('../utils/queryFilters');

const getSuppliers = async (req, res) => {
  try {
    const { search, status, city, debt } = req.query;
    const filter = {};
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { document: regex }, { phone: regex }, { email: regex }, { city: regex }];
    }
    if (status) filter.status = status;
    if (city) filter.city = new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (debt === 'withDebt') filter.currentDebt = { $gt: 0 };
    if (debt === 'withoutDebt') filter.currentDebt = { $lte: 0 };
    applyDateRange(filter, req.query);
    return res.json(await paginatedResponse(Supplier, { filter, query: req.query, sortDefault: { createdAt: -1 } }));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando proveedores.', error: error.message });
  }
};

const sanitizeSupplierPayload = (body = {}) => {
  const payload = { ...body };
  delete payload.currentDebt;
  delete payload.status;
  if (payload.creditLimit !== undefined) payload.creditLimit = Number(payload.creditLimit || 0);
  if (payload.paymentTermDays !== undefined) payload.paymentTermDays = Number(payload.paymentTermDays || 0);
  return payload;
};

const validateSupplierPayload = (payload) => {
  if (!payload.name || !String(payload.name).trim()) return 'El nombre o razon social del proveedor es obligatorio.';
  if (!payload.document || !String(payload.document).trim()) return 'El NIT o documento del proveedor es obligatorio.';
  if (payload.creditLimit !== undefined && (!Number.isFinite(Number(payload.creditLimit)) || Number(payload.creditLimit) < 0)) return 'El cupo de credito no puede ser negativo.';
  if (payload.paymentTermDays !== undefined && (!Number.isFinite(Number(payload.paymentTermDays)) || Number(payload.paymentTermDays) < 0)) return 'El plazo de pago no puede ser negativo.';
  return '';
};

const createSupplier = async (req, res) => {
  try {
    const payload = sanitizeSupplierPayload(req.body);
    const validationMessage = validateSupplierPayload(payload);
    if (validationMessage) return res.status(400).json({ message: validationMessage });
    const supplier = await Supplier.create(payload);
    await createAuditLog({ req, action: 'CREATE', module: 'suppliers', entityId: supplier._id, entityType: 'Supplier', description: 'Proveedor creado', after: supplier.toObject() });
    return res.status(201).json(supplier);
  } catch (error) {
    return res.status(400).json({ message: 'Error creando proveedor.', error: error.message });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado.' });
    const payload = sanitizeSupplierPayload(req.body);
    const validationMessage = validateSupplierPayload({ ...supplier.toObject(), ...payload });
    if (validationMessage) return res.status(400).json({ message: validationMessage });
    const before = supplier.toObject();
    Object.assign(supplier, payload);
    await supplier.save();
    await createAuditLog({ req, action: 'UPDATE', module: 'suppliers', entityId: supplier._id, entityType: 'Supplier', description: 'Proveedor actualizado', before, after: supplier.toObject() });
    return res.json(supplier);
  } catch (error) {
    return res.status(400).json({ message: 'Error actualizando proveedor.', error: error.message });
  }
};

const deleteSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado.' });

    const [purchases, payments] = await Promise.all([
      Purchase.countDocuments({ supplier: supplier._id }),
      SupplierPayment.countDocuments({ supplier: supplier._id })
    ]);

    if (purchases || payments || Number(supplier.currentDebt || 0) > 0) {
      return res.status(409).json({
        message: 'No se puede eliminar el proveedor porque tiene compras, pagos o deuda asociada.',
        details: { purchases, payments, currentDebt: supplier.currentDebt }
      });
    }

    await Supplier.deleteOne({ _id: supplier._id });
    await createAuditLog({ req, action: 'DELETE', module: 'suppliers', entityId: supplier._id, entityType: 'Supplier', description: 'Proveedor eliminado', before: supplier.toObject() });
    return res.json({ message: 'Proveedor eliminado correctamente.' });
  } catch (error) {
    return res.status(400).json({ message: 'Error eliminando proveedor.', error: error.message });
  }
};

module.exports = { getSuppliers, createSupplier, updateSupplier, deleteSupplier };
