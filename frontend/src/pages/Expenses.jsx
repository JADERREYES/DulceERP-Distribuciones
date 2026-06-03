import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../api/axios';
import { exportToCsv, formatCurrency, formatDate, normalizeRowsForExport } from '../utils/exportUtils';

const categories = ['administracion', 'ventas', 'logistica', 'tecnologia', 'seguridad', 'marketing', 'servicios', 'nomina', 'mantenimiento', 'combustible'];
const paymentMethods = ['efectivo', 'transferencia', 'tarjeta', 'otro'];
const initialForm = { concept: '', category: 'administracion', amount: 0, date: '', paymentMethod: 'efectivo', description: '' };
const initialFilters = { search: '', category: '', paymentMethod: '', from: '', to: '' };

const monthKey = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toISOString().slice(0, 7);
};

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState(initialFilters);
  const [editingExpense, setEditingExpense] = useState(null);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const queryString = (currentFilters = filters) => {
    const params = new URLSearchParams({ limit: '100' });
    Object.entries(currentFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  };

  const loadExpenses = async (currentFilters = filters) => {
    const { data } = await api.get(`/expenses?${queryString(currentFilters)}`);
    setExpenses(data.data || data);
  };

  useEffect(() => {
    loadExpenses().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando gastos.'));
  }, []);

  const totalExpenses = useMemo(() => expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0), [expenses]);

  const byCategory = useMemo(() => {
    const grouped = expenses.reduce((acc, expense) => {
      const key = expense.category || 'sin_categoria';
      acc[key] = (acc[key] || 0) + Number(expense.amount || 0);
      return acc;
    }, {});
    return Object.entries(grouped).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  const byMonth = useMemo(() => {
    const grouped = expenses.reduce((acc, expense) => {
      const key = monthKey(expense.date || expense.createdAt);
      acc[key] = (acc[key] || 0) + Number(expense.amount || 0);
      return acc;
    }, {});
    return Object.entries(grouped).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
  }, [expenses]);

  const resetForm = () => {
    setEditingExpense(null);
    setForm(initialForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      if (editingExpense) {
        await api.put(`/expenses/${editingExpense._id}`, form);
        setSuccess('Gasto actualizado correctamente.');
      } else {
        await api.post('/expenses', form);
        setSuccess('Gasto registrado correctamente.');
      }
      resetForm();
      await loadExpenses();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error guardando gasto.');
    }
  };

  const editExpense = (expense) => {
    setEditingExpense(expense);
    setForm({
      concept: expense.concept || '',
      category: expense.category || 'administracion',
      amount: Number(expense.amount || 0),
      date: expense.date ? new Date(expense.date).toISOString().slice(0, 10) : '',
      paymentMethod: expense.paymentMethod || 'efectivo',
      description: expense.description || ''
    });
  };

  const deleteExpense = async (expense) => {
    const ok = window.confirm(`Eliminar el gasto "${expense.concept}" solo debe hacerse si no esta usado en un cierre o reporte bloqueado. Esta accion queda auditada. Continuar?`);
    if (!ok) return;
    try {
      await api.delete(`/expenses/${expense._id}`);
      setSuccess('Gasto eliminado correctamente.');
      await loadExpenses();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error eliminando gasto.');
    }
  };

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const applyFilters = () => {
    setError('');
    loadExpenses().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error consultando gastos.'));
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    loadExpenses(initialFilters).catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error consultando gastos.'));
  };

  const exportExpenses = () => {
    const rows = normalizeRowsForExport(expenses, [
      { header: 'Fecha', value: (expense) => formatDate(expense.date || expense.createdAt) },
      { header: 'Concepto', key: 'concept' },
      { header: 'Categoria', key: 'category' },
      { header: 'Metodo de pago', value: (expense) => expense.paymentMethod || 'efectivo' },
      { header: 'Valor', key: 'amount' },
      { header: 'Descripcion', key: 'description' }
    ]);
    const ok = exportToCsv('gastos-filtrados.csv', rows);
    if (!ok) setError('No hay gastos para exportar.');
  };

  return (
    <div className="page-stack report-print-area">
      <div className="page-title">
        <h2>Gastos operacionales</h2>
        <p>Registro, filtros, resumen y graficas por categoria y mes.</p>
      </div>

      <div className="module-toolbar no-print">
        <input placeholder="Buscar concepto o descripcion" value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} />
        <select value={filters.category} onChange={(e) => updateFilter('category', e.target.value)}>
          <option value="">Todas las categorias</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={filters.paymentMethod} onChange={(e) => updateFilter('paymentMethod', e.target.value)}>
          <option value="">Todos los metodos</option>
          {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={(e) => updateFilter('from', e.target.value)} />
        <input type="date" value={filters.to} onChange={(e) => updateFilter('to', e.target.value)} />
        <button className="button primary" type="button" onClick={applyFilters}>Consultar</button>
        <button className="button secondary" type="button" onClick={clearFilters}>Limpiar</button>
        <button className="button secondary" type="button" onClick={exportExpenses}>Exportar</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>

      <form className="form-grid no-print" onSubmit={handleSubmit}>
        <label>Concepto<input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} required /></label>
        <label>Categoria<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select></label>
        <label>Valor<input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required /></label>
        <label>Fecha<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        <label>Metodo de pago<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
          {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
        </select></label>
        <label className="wide">Descripcion<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <button className="button primary" type="submit">{editingExpense ? 'Guardar cambios' : 'Registrar gasto'}</button>
        {editingExpense && <button className="button ghost" type="button" onClick={resetForm}>Cancelar edicion</button>}
      </form>

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      <section className="kpi-grid">
        <article className="kpi-card info"><span>Total filtrado</span><strong>{formatCurrency(totalExpenses)}</strong><small>{expenses.length} gasto(s)</small></article>
        <article className="kpi-card warning"><span>Categoria principal</span><strong>{byCategory[0]?.name || '-'}</strong><small>{formatCurrency(byCategory[0]?.value || 0)}</small></article>
        <article className="kpi-card positive"><span>Meses consultados</span><strong>{byMonth.length}</strong><small>Segun rango filtrado</small></article>
      </section>

      <section className="dashboard-grid">
        <div className="chart-card">
          <div className="chart-card-header"><h3>Gastos por categoria</h3><span>{byCategory.length} categoria(s)</span></div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(value) => `$${Number(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="value" fill="#11845b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-card-header"><h3>Gastos por mes</h3><span>{byMonth.length} periodo(s)</span></div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(value) => `$${Number(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {selectedExpense && (
        <div className="detail-panel">
          <h3>Detalle gasto</h3>
          <p>{selectedExpense.concept} - {formatCurrency(selectedExpense.amount)} - {selectedExpense.category}</p>
          <p>Fecha: {formatDate(selectedExpense.date || selectedExpense.createdAt)}. Metodo: {selectedExpense.paymentMethod || 'efectivo'}.</p>
          <p>{selectedExpense.description || 'Sin descripcion.'}</p>
          <button className="button ghost" type="button" onClick={() => setSelectedExpense(null)}>Cerrar detalle</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoria</th><th>Metodo</th><th>Valor</th><th>Descripcion</th><th className="no-print">Acciones</th></tr></thead>
          <tbody>
            {expenses.length === 0 && <tr><td colSpan="7">No hay gastos para los filtros seleccionados.</td></tr>}
            {expenses.map((expense) => (
              <tr key={expense._id}>
                <td>{formatDate(expense.date || expense.createdAt)}</td>
                <td>{expense.concept}</td>
                <td><span className="badge info">{expense.category}</span></td>
                <td>{expense.paymentMethod || 'efectivo'}</td>
                <td>{formatCurrency(expense.amount)}</td>
                <td>{expense.description || '-'}</td>
                <td className="no-print">
                  <button className="button secondary" type="button" onClick={() => setSelectedExpense(expense)}>Ver</button>
                  <button className="button secondary" type="button" onClick={() => editExpense(expense)}>Editar</button>
                  <button className="button danger" type="button" onClick={() => deleteExpense(expense)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
