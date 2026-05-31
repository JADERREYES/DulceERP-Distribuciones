import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Payments() {
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [form, setForm] = useState({ customer: '', amount: 0, paymentMethod: 'efectivo', note: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const debtCustomers = useMemo(() => customers.filter((customer) => Number(customer.currentDebt) > 0), [customers]);
  const selectedCustomer = useMemo(() => customers.find((customer) => customer._id === form.customer), [customers, form.customer]);

  const loadData = async () => {
    const [customersRes, paymentsRes] = await Promise.all([api.get('/customers'), api.get('/payments')]);
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
      setSuccess('Pago registrado correctamente.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Error registrando pago.');
    }
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Pagos / Cartera</h2>
        <p>Registro de abonos y seguimiento de clientes con saldo pendiente.</p>
      </div>

      <section className="split-grid">
        <form className="form-grid single" onSubmit={handleSubmit}>
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
      </section>

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Metodo</th><th>Aplicado a ventas</th><th>Nota</th></tr></thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment._id}>
                <td>{new Date(payment.createdAt).toLocaleDateString('es-CO')}</td>
                <td>{payment.customer?.name}</td>
                <td>{money.format(payment.amount)}</td>
                <td>{payment.paymentMethod}</td>
                <td>{payment.appliedToSales?.length ? payment.appliedToSales.map((item) => money.format(item.amountApplied)).join(', ') : '-'}</td>
                <td>{payment.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
