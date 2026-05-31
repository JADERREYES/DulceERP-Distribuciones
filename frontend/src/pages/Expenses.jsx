import { useEffect, useState } from 'react';
import api from '../api/axios';

const categories = ['administracion', 'ventas', 'logistica', 'tecnologia', 'seguridad', 'marketing', 'servicios', 'nomina', 'mantenimiento', 'combustible'];
const initialForm = { concept: '', category: 'administracion', amount: 0, date: '', description: '' };

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');

  const loadExpenses = () => api.get('/expenses').then(({ data }) => setExpenses(data.data || data));

  useEffect(() => {
    loadExpenses().catch((err) => setError(err.response?.data?.message || 'Error cargando gastos.'));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.post('/expenses', form);
      setForm(initialForm);
      await loadExpenses();
    } catch (err) {
      setError(err.response?.data?.message || 'Error creando gasto.');
    }
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Gastos operacionales</h2>
        <p>Registro de egresos por categoria.</p>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>Concepto<input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} required /></label>
        <label>Categoria<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select></label>
        <label>Valor<input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required /></label>
        <label>Fecha<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        <label className="wide">Descripcion<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <button className="button primary" type="submit">Registrar gasto</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoria</th><th>Valor</th><th>Descripcion</th></tr></thead>
          <tbody>
            {expenses.map((expense) => (
              <tr key={expense._id}>
                <td>{new Date(expense.date).toLocaleDateString('es-CO')}</td>
                <td>{expense.concept}</td>
                <td>{expense.category}</td>
                <td>${Number(expense.amount).toLocaleString('es-CO')}</td>
                <td>{expense.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
