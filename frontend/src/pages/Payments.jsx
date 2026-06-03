import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { exportToCsv, formatDate } from '../utils/exportUtils';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Payments() {
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [form, setForm] = useState({ customer: '', amount: 0, paymentMethod: 'efectivo', note: '' });
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ customer: '', paymentMethod: '', from: '', to: '' });
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const debtCustomers = useMemo(() => customers.filter((customer) => Number(customer.currentDebt) > 0), [customers]);
  const selectedCustomer = useMemo(() => customers.find((customer) => customer._id === form.customer), [customers, form.customer]);

  const loadData = async () => {
    const params = new URLSearchParams({ limit: '100' });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const [customersRes, paymentsRes] = await Promise.all([api.get('/customers?limit=100'), api.get(`/payments?${params.toString()}`)]);
    setCustomers(customersRes.data.data || customersRes.data);
    setPayments(paymentsRes.data.data || paymentsRes.data);
  };

  useEffect(() => {
    loadData().catch((err) => setError(err.response?.data?.message || 'Error cargando cartera.'));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    try {
      await api.post('/payments', form);
      setForm({ customer: '', amount: 0, paymentMethod: 'efectivo', note: '' });
      setShowForm(false);
      setSuccess('Pago registrado correctamente.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Error registrando pago.');
    }
  };

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const exportPayments = () => {
    const ok = exportToCsv('pagos-filtrados.csv', payments.map((payment) => ({
      Fecha: formatDate(payment.createdAt),
      Cliente: payment.customer?.name || '',
      Documento: payment.customer?.document || '',
      Monto: payment.amount,
      Metodo: payment.paymentMethod,
      'Aplicado a ventas': payment.appliedToSales?.map((item) => `${formatDate(item.sale?.createdAt)} ${item.amountApplied}`).join(' | ') || '',
      Nota: payment.note || ''
    })));
    if (!ok) setError('No hay pagos para exportar.');
  };

  const startPayment = () => {
    setForm({ customer: '', amount: 0, paymentMethod: 'efectivo', note: '' });
    setError('');
    setSuccess('');
    setShowForm(true);
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Pagos / Cartera</h2>
        <p>Registro de abonos y seguimiento de clientes con saldo pendiente.</p>
      </div>

      <div className="module-toolbar">
        <button className="button primary" type="button" onClick={startPayment}>Registrar pago</button>
        <button className="button secondary" type="button" onClick={exportPayments}>Exportar</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>

      {showForm && <section className="split-grid">
        <form className="form-grid single" onSubmit={handleSubmit}>
          <div className="section-heading"><h3>Registrar pago</h3></div>
          <label>Cliente con deuda<select value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} required>
            <option value="">Seleccionar</option>{debtCustomers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name} - {money.format(customer.currentDebt)}</option>)}
          </select></label>
          <label>Monto pagado<input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required /></label>
          <label>Metodo de pago<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
            <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option>
          </select></label>
          <label>Nota<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          {selectedCustomer && <div className="inline-total">Deuda actual: {money.format(selectedCustomer.currentDebt)}</div>}
          <button className="button primary" type="submit">Registrar pago</button>
          <button className="button ghost" type="button" onClick={() => setShowForm(false)}>Cancelar</button>
          {debtCustomers.length === 0 && <div className="notice info">No hay clientes con deuda pendiente.</div>}
        </form>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Documento</th><th>Deuda</th><th>Estado</th></tr></thead>
            <tbody>
              {debtCustomers.map((customer) => (
                <tr key={customer._id}>
                  <td>{customer.name}</td>
                  <td>{customer.document}</td>
                  <td>{money.format(customer.currentDebt)}</td>
                  <td><span className={`badge ${customer.status}`}>{customer.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>}

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      <div className="module-toolbar">
        <select value={filters.customer} onChange={(e) => updateFilter('customer', e.target.value)}>
          <option value="">Todos los clientes</option>
          {customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}</option>)}
        </select>
        <select value={filters.paymentMethod} onChange={(e) => updateFilter('paymentMethod', e.target.value)}>
          <option value="">Todos los metodos</option>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="otro">Otro</option>
        </select>
        <input type="date" value={filters.from} onChange={(e) => updateFilter('from', e.target.value)} />
        <input type="date" value={filters.to} onChange={(e) => updateFilter('to', e.target.value)} />
        <button className="button primary" type="button" onClick={loadData}>Consultar</button>
      </div>

      {selectedPayment && (
        <div className="detail-panel">
          <h3>Detalle pago</h3>
          <p>{selectedPayment.customer?.name} - {money.format(selectedPayment.amount)} - {selectedPayment.paymentMethod}</p>
          <ul>{selectedPayment.appliedToSales?.map((item) => <li key={`${selectedPayment._id}-${item.sale?._id || item.sale}`}>Venta {formatDate(item.sale?.createdAt)}: {money.format(item.amountApplied)} aplicado</li>)}</ul>
          <button className="button ghost" type="button" onClick={() => setSelectedPayment(null)}>Cerrar detalle</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Metodo</th><th>Aplicado a ventas</th><th>Nota</th><th>Accion</th></tr></thead>
          <tbody>
            {payments.length === 0 && <tr><td colSpan="7">No hay pagos registrados todavía. Usa el botón Registrar pago para crear el primero.</td></tr>}
            {payments.map((payment) => (
              <tr key={payment._id}>
                <td>{new Date(payment.createdAt).toLocaleDateString('es-CO')}</td>
                <td>{payment.customer?.name}</td>
                <td>{money.format(payment.amount)}</td>
                <td>{payment.paymentMethod}</td>
                <td>{payment.appliedToSales?.length ? payment.appliedToSales.map((item) => money.format(item.amountApplied)).join(', ') : '-'}</td>
                <td>{payment.note || '-'}</td>
                <td><button className="button secondary" type="button" onClick={() => setSelectedPayment(payment)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
