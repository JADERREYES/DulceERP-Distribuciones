import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { exportToCsv } from '../utils/exportUtils';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const initialForm = {
  name: '',
  document: '',
  phone: '',
  email: '',
  type: 'tienda',
  zone: '',
  creditLimit: 0,
  paymentTermDays: 15
};

const usagePercent = (customer) => {
  const creditLimit = Number(customer.creditLimit || 0);
  if (creditLimit <= 0) return Number(customer.currentDebt || 0) > 0 ? 100 : 0;
  return (Number(customer.currentDebt || 0) / creditLimit) * 100;
};

export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [debtDetail, setDebtDetail] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
          customer.zone.toLowerCase().includes(q) ||
          (customer.phone || '').toLowerCase().includes(q);
        const matchesStatus = !filters.status || customer.status === filters.status;
        return matchesText && matchesStatus;
      }),
    [customers, filters]
  );

  const usageTone = (customer) => {
    const usage = usagePercent(customer);
    if (usage > 80) return 'danger';
    if (usage >= 50) return 'warning';
    return 'positive';
  };

  useEffect(() => {
    loadCustomers().catch((err) => setError(err.response?.data?.message || 'Error cargando clientes.'));
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setEditingCustomer(null);
    setShowForm(false);
    setError('');
    setSuccess('');
  };

  const editCustomer = (customer) => {
    setEditingCustomer(customer);
    setShowForm(true);
    setForm({
      name: customer.name || '',
      document: customer.document || '',
      phone: customer.phone || '',
      email: customer.email || '',
      type: customer.type || 'tienda',
      zone: customer.zone || '',
      creditLimit: Number(customer.creditLimit || 0),
      paymentTermDays: Number(customer.paymentTermDays || 0)
    });
    setError('');
    setSuccess('');
  };

  const startNewCustomer = () => {
    setForm(initialForm);
    setEditingCustomer(null);
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const validateForm = () => {
    if (!form.name.trim()) return 'El nombre es obligatorio.';
    if (!form.document.trim()) return 'El documento es obligatorio.';
    if (Number(form.creditLimit) < 0) return 'El cupo de credito no puede ser negativo.';
    if (Number(form.paymentTermDays) < 0) return 'El plazo de pago no puede ser negativo.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'El email no tiene un formato valido.';
    if (editingCustomer && Number(form.creditLimit) < Number(editingCustomer.currentDebt || 0)) {
      return 'El cupo no puede ser menor que la deuda actual del cliente.';
    }
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const validationMessage = validateForm();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    const payload = {
      name: form.name,
      document: form.document,
      phone: form.phone,
      email: form.email,
      type: form.type,
      zone: form.zone,
      creditLimit: Number(form.creditLimit || 0),
      paymentTermDays: Number(form.paymentTermDays || 0)
    };

    try {
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer._id}`, payload);
        setSuccess('Cliente actualizado correctamente.');
      } else {
        await api.post('/customers', payload);
        setSuccess('Cliente creado correctamente.');
      }
      resetForm();
      await loadCustomers();
    } catch (err) {
      setError(err.response?.data?.message || err.userMessage || 'No se pudo guardar el cliente.');
    }
  };

  const viewDebt = async (customer) => {
    setError('');
    setSuccess('');
    try {
      const { data } = await api.get(`/customers/${customer._id}/debt-detail`);
      setDebtDetail(data);
    } catch (err) {
      setError(err.response?.data?.message || err.userMessage || 'No se pudo consultar el detalle de cartera.');
    }
  };

  const deleteCustomer = async (customer) => {
    if (!window.confirm(`Eliminar cliente "${customer.name}" solo es permitido si no tiene ventas, pagos ni deuda. Continuar?`)) return;
    try {
      await api.delete(`/customers/${customer._id}`);
      setSuccess('Cliente eliminado correctamente.');
      await loadCustomers();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error eliminando cliente.');
    }
  };

  const exportCustomers = () => {
    const ok = exportToCsv('clientes-filtrados.csv', filteredCustomers.map((customer) => ({
      Cliente: customer.name,
      Documento: customer.document,
      Telefono: customer.phone || '',
      Email: customer.email || '',
      Tipo: customer.type || '',
      Zona: customer.zone || '',
      Cupo: customer.creditLimit || 0,
      Deuda: customer.currentDebt || 0,
      Estado: customer.status || ''
    })));
    if (!ok) setError('No hay clientes para exportar.');
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Clientes B2B</h2>
        <p>Cartera, zonas, cupos y estados comerciales.</p>
      </div>
      <div className="notice info">Diferencia cartera $0 significa que la cartera esta conciliada, no necesariamente que no existan clientes con deuda.</div>
      <div className="module-toolbar">
        <button className="button primary" type="button" onClick={startNewCustomer}>Nuevo cliente</button>
        <input placeholder="Buscar cliente, documento, telefono o zona" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="riesgo">Riesgo</option>
          <option value="bloqueado">Bloqueado</option>
        </select>
        <button className="button secondary" type="button" onClick={exportCustomers}>Exportar</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>
      {showForm && <form className="form-grid" onSubmit={handleSubmit}>
        <div className="section-heading wide"><h3>{editingCustomer ? 'Editando cliente' : 'Nuevo cliente'}</h3><span>Datos comerciales y cupo</span></div>
        <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Documento<input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} required /></label>
        <label>Telefono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Tipo<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="tienda">Tienda</option><option value="minimercado">Minimercado</option><option value="colegio">Colegio</option><option value="institucional">Institucional</option><option value="cafeteria">Cafeteria</option><option value="mayorista">Mayorista</option>
        </select></label>
        <label>Zona<input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} required /></label>
        <label>Cupo credito<input type="number" min="0" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} /></label>
        <label>Plazo dias<input type="number" min="0" value={form.paymentTermDays} onChange={(e) => setForm({ ...form, paymentTermDays: e.target.value })} /></label>
        {editingCustomer && (
          <div className="notice warning wide">
            Deuda actual: {money.format(editingCustomer.currentDebt || 0)}. La deuda se actualiza automaticamente con ventas, pagos y anulaciones; no se edita manualmente.
          </div>
        )}
        <button className="button primary" type="submit">{editingCustomer ? 'Actualizar cliente' : 'Crear cliente'}</button>
        <button className="button secondary" type="button" onClick={resetForm}>Cancelar</button>
      </form>}
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      {debtDetail && (
        <section className="page-stack">
          <div className="section-heading">
            <h3>Detalle de cartera: {debtDetail.customer.name}</h3>
            <button className="button secondary" type="button" onClick={() => setDebtDetail(null)}>Cerrar</button>
          </div>
          <section className="kpi-grid">
            <article className="kpi-card warning"><span>Deuda actual</span><strong>{money.format(debtDetail.summary.currentDebt)}</strong></article>
            <article className="kpi-card info"><span>Ventas credito pendientes</span><strong>{money.format(debtDetail.summary.pendingSalesBalance)}</strong></article>
            <article className={`kpi-card ${debtDetail.summary.difference === 0 ? 'positive' : 'danger'}`}><span>Diferencia</span><strong>{money.format(debtDetail.summary.difference)}</strong></article>
          </section>
          <div className="table-wrap">
            <table>
              <thead><tr><th colSpan="5">Ventas pendientes</th></tr><tr><th>Fecha</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Estado</th></tr></thead>
              <tbody>
                {debtDetail.pendingSales.length === 0 && <tr><td colSpan="5">No hay ventas credito pendientes.</td></tr>}
                {debtDetail.pendingSales.map((sale) => (
                  <tr key={sale._id}><td>{new Date(sale.date).toLocaleDateString('es-CO')}</td><td>{money.format(sale.total)}</td><td>{money.format(sale.paidAmount)}</td><td>{money.format(sale.balance)}</td><td>{sale.paymentStatus}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th colSpan="5">Pagos recientes</th></tr><tr><th>Fecha</th><th>Monto</th><th>Metodo</th><th>Nota</th><th>Aplicaciones</th></tr></thead>
              <tbody>
                {debtDetail.payments.length === 0 && <tr><td colSpan="5">No hay pagos registrados.</td></tr>}
                {debtDetail.payments.map((payment) => (
                  <tr key={payment._id}><td>{new Date(payment.date).toLocaleDateString('es-CO')}</td><td>{money.format(payment.amount)}</td><td>{payment.paymentMethod}</td><td>{payment.note || '-'}</td><td>{payment.appliedToSales?.length || 0}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Cliente</th><th>Documento</th><th>Telefono</th><th>Zona</th><th>Cupo</th><th>Deuda</th><th>Uso cupo</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 && <tr><td colSpan="9">No hay clientes todavía. Usa el botón Nuevo cliente para crear el primero.</td></tr>}
            {filteredCustomers.map((customer) => (
              <tr key={customer._id} className={`row-${customer.status}`}>
                <td>{customer.name}</td><td>{customer.document}</td><td>{customer.phone || '-'}</td><td>{customer.zone}</td>
                <td>{money.format(customer.creditLimit)}</td>
                <td className={Number(customer.currentDebt) > 0 ? 'error' : ''}>{money.format(customer.currentDebt)}</td>
                <td><span className={`risk-dot ${usageTone(customer)}`}></span>{usagePercent(customer).toFixed(1)}%</td>
                <td><span className={`badge ${customer.status}`}>{customer.status}</span></td>
                <td>
                  <button className="button secondary" type="button" onClick={() => editCustomer(customer)}>Editar</button>
                  <button className="button ghost" type="button" onClick={() => viewDebt(customer)}>Ver deuda</button>
                  {user?.role === 'admin' && <button className="button danger" type="button" onClick={() => deleteCustomer(customer)}>Eliminar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
