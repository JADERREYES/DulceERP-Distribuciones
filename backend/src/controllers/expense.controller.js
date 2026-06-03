const Expense = require('../models/Expense');
const { paginatedResponse } = require('../utils/pagination');
const { applyDateRange, escapeRegex } = require('../utils/queryFilters');
const { createAuditLog } = require('../utils/auditLogger');

const getExpenses = async (req, res) => {
  try {
    const { search, category, paymentMethod } = req.query;
    const filter = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ concept: regex }, { category: regex }, { description: regex }, { paymentMethod: regex }];
    }
    if (category) filter.category = category;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    applyDateRange(filter, req.query, 'date');
    return res.json(await paginatedResponse(Expense, { filter, query: req.query, sortDefault: { date: -1 } }));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando gastos.', error: error.message });
  }
};

const createExpense = async (req, res) => {
  try {
    const { concept, category, amount } = req.body;
    if (!concept || !category || amount === undefined) {
      return res.status(400).json({ message: 'Concepto, categoria y valor son obligatorios.' });
    }
    if (Number(amount) <= 0) {
      return res.status(400).json({ message: 'El valor del gasto debe ser mayor que 0.' });
    }
    const expense = await Expense.create(req.body);
    await createAuditLog({
      req,
      action: 'CREATE',
      module: 'expenses',
      entityId: expense._id,
      entityType: 'Expense',
      description: 'Gasto creado',
      after: expense.toObject()
    });
    return res.status(201).json(expense);
  } catch (error) {
    return res.status(400).json({ message: 'Error creando gasto.', error: error.message });
  }
};

const getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Gasto no encontrado.' });
    return res.json(expense);
  } catch (error) {
    return res.status(400).json({ message: 'Error consultando gasto.', error: error.message });
  }
};

const updateExpense = async (req, res) => {
  try {
    if (req.body.amount !== undefined && Number(req.body.amount) <= 0) {
      return res.status(400).json({ message: 'El valor del gasto debe ser mayor que 0.' });
    }

    const beforeExpense = await Expense.findById(req.params.id);
    if (!beforeExpense) return res.status(404).json({ message: 'Gasto no encontrado.' });
    const before = beforeExpense.toObject();
    Object.assign(beforeExpense, req.body);
    const expense = await beforeExpense.save();
    if (!expense) return res.status(404).json({ message: 'Gasto no encontrado.' });
    await createAuditLog({
      req,
      action: 'UPDATE',
      module: 'expenses',
      entityId: expense._id,
      entityType: 'Expense',
      description: 'Gasto actualizado',
      before,
      after: expense.toObject()
    });
    return res.json(expense);
  } catch (error) {
    return res.status(400).json({ message: 'Error actualizando gasto.', error: error.message });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Gasto no encontrado.' });
    await createAuditLog({
      req,
      action: 'DELETE',
      module: 'expenses',
      entityId: expense._id,
      entityType: 'Expense',
      description: 'Gasto eliminado',
      before: expense.toObject()
    });
    return res.json({ message: 'Gasto eliminado correctamente.' });
  } catch (error) {
    return res.status(400).json({ message: 'Error eliminando gasto.', error: error.message });
  }
};

module.exports = { getExpenses, createExpense, getExpenseById, updateExpense, deleteExpense };
