import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const initialForm = {
  name: '',
  document: '',
  phone: '',
  email: '',
  type: 'tienda',
  zone: '',
  creditLimit: 0,
  currentDebt: 0,
  paymentTermDays: 15
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '' });

  const loadCustomers = () => api.get('/customers').then(({ data }) => setCustomers(data.data || data));
  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        const q = filters.q.toLowerCase();
        const matchesText =
          !q ||
          customer.name.toLowerCase().includes(q) ||
          customer.document.toLowerCase().includes(q) ||
          customer.zone.toLowerCase().includes(q);
        const matchesStatus = !filters.status || customer.status === filters.status;
        return matchesText && matchesStatus;
      }),
    [customers, filters]
  );

  const usageTone = (customer) => {
    const usage = Number(customer.creditLimit) > 0 ? (Number(customer.currentDebt) / Number(customer.creditLimit)) * 100 : 100;
    if (usage > 80) return 'danger';
    if (usage >= 50) return 'warning';
    return 'positive';
  };

  useEffect(() => {
    loadCustomers().catch((err) => setError(err.response?.data?.message || 'Error cargando clientes.'));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.post('/customers', form);
      setForm(initialForm);
      await loadCustomers();
    } catch (err) {
      setError(err.response?.data?.message || 'Error creando cliente.');
    }
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Clientes B2B</h2>
        <p>Cartera, zonas, cupos y estados comerciales.</p>
      </div>
      <div className="module-toolbar">
        <input placeholder="Buscar cliente, documento o zona" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="riesgo">Riesgo</option>
          <option value="bloqueado">Bloqueado</option>
        </select>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Documento<input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} required /></label>
        <label>Telefono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Tipo<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="tienda">Tienda</option><option value="minimercado">Minimercado</option><option value="colegio">Colegio</option><option value="institucional">Institucional</option><option value="cafeteria">Cafeteria</option><option value="mayorista">Mayorista</option>
        </select></label>
        <label>Zona<input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} required /></label>
        <label>Cupo credito<input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} /></label>
        <label>Plazo dias<input type="number" value={form.paymentTermDays} onChange={(e) => setForm({ ...form, paymentTermDays: Number(e.target.value) })} /></label>
        <button className="button primary" type="submit">Crear cliente</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Cliente</th><th>Documento</th><th>Tipo</th><th>Zona</th><th>Cupo</th><th>Deuda</th><th>Uso cupo</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {filteredCustomers.map((customer) => (
              <tr key={customer._id} className={`row-${customer.status}`}>
                <td>{customer.name}</td><td>{customer.document}</td><td>{customer.type}</td><td>{customer.zone}</td>
                <td>${Number(customer.creditLimit).toLocaleString('es-CO')}</td>
                <td>${Number(customer.currentDebt).toLocaleString('es-CO')}</td>
                <td><span className={`risk-dot ${usageTone(customer)}`}></span>{Number(customer.creditLimit) > 0 ? `${((Number(customer.currentDebt) / Number(customer.creditLimit)) * 100).toFixed(1)}%` : '100%'}</td>
                <td><span className={`badge ${customer.status}`}>{customer.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
