import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { exportToCsv, formatDate } from '../utils/exportUtils';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function SupplierPayments() {
  const [suppliers, setSuppliers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [form, setForm] = useState({ supplier: '', amount: 0, paymentMethod: 'transferencia', note: '' });
  const [filters, setFilters] = useState({ supplier: '', paymentMethod: '', from: '', to: '' });
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [error, setError] = useState('');
  const suppliersWithDebt = useMemo(() => suppliers.filter((supplier) => Number(supplier.currentDebt) > 0), [suppliers]);
  const selectedSupplier = suppliers.find((supplier) => supplier._id === form.supplier);

  const load = async () => {
    const params = new URLSearchParams({ limit: '100' });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const [suppliersRes, paymentsRes] = await Promise.all([api.get('/suppliers?limit=100'), api.get(`/supplier-payments?${params.toString()}`)]);
    setSuppliers(suppliersRes.data.data || suppliersRes.data);
    setPayments(paymentsRes.data.data || paymentsRes.data);
  };
  useEffect(() => { load().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando pagos a proveedores.')); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.post('/supplier-payments', form);
      setForm({ supplier: '', amount: 0, paymentMethod: 'transferencia', note: '' });
      await load();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error registrando pago a proveedor.');
    }
  };

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const exportPayments = () => {
    const ok = exportToCsv('pagos-proveedores-filtrados.csv', payments.map((payment) => ({
      Fecha: formatDate(payment.createdAt),
      Proveedor: payment.supplier?.name || '',
      Monto: payment.amount,
      Metodo: payment.paymentMethod,
      'Aplicado a compras': payment.appliedToPurchases?.map((item) => `${item.purchase?.invoiceNumber || formatDate(item.purchase?.createdAt)} ${item.amountApplied}`).join(' | ') || '',
      Nota: payment.note || ''
    })));
    if (!ok) setError('No hay pagos a proveedores para exportar.');
  };

  return (
    <div className="page-stack">
      <div className="page-title"><h2>Pagos a proveedores</h2><p>Control de obligaciones y cuentas por pagar.</p></div>
      <form className="form-grid" onSubmit={submit}>
        <label>Proveedor<select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required><option value="">Seleccionar</option>{suppliersWithDebt.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name} - {money.format(supplier.currentDebt)}</option>)}</select></label>
        <label>Monto<input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required /></label>
        <label>Metodo<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select></label>
        <label>Nota<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        {selectedSupplier && <div className="inline-total">Deuda proveedor: {money.format(selectedSupplier.currentDebt)}</div>}
        <button className="button primary" type="submit">Registrar pago</button>
        {suppliersWithDebt.length === 0 && <div className="notice info">No hay proveedores con deuda pendiente para registrar pagos.</div>}
      </form>
      {error && <p className="error">{error}</p>}
      <div className="module-toolbar">
        <select value={filters.supplier} onChange={(e) => updateFilter('supplier', e.target.value)}>
          <option value="">Todos los proveedores</option>
          {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
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
        <button className="button primary" type="button" onClick={load}>Consultar</button>
        <button className="button secondary" type="button" onClick={exportPayments}>Exportar</button>
      </div>
      {selectedPayment && (
        <div className="detail-panel">
          <h3>Detalle pago proveedor</h3>
          <p>{selectedPayment.supplier?.name} - {money.format(selectedPayment.amount)} - {selectedPayment.paymentMethod}</p>
          <ul>{selectedPayment.appliedToPurchases?.map((item) => <li key={`${selectedPayment._id}-${item.purchase?._id || item.purchase}`}>Compra {item.purchase?.invoiceNumber || formatDate(item.purchase?.createdAt)}: {money.format(item.amountApplied)} aplicado</li>)}</ul>
          <button className="button ghost" type="button" onClick={() => setSelectedPayment(null)}>Cerrar detalle</button>
        </div>
      )}
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Monto</th><th>Metodo</th><th>Aplicado a compras</th><th>Nota</th><th>Accion</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment._id}><td>{new Date(payment.createdAt).toLocaleDateString('es-CO')}</td><td>{payment.supplier?.name}</td><td>{money.format(payment.amount)}</td><td>{payment.paymentMethod}</td><td>{payment.appliedToPurchases?.length ? payment.appliedToPurchases.map((item) => money.format(item.amountApplied)).join(', ') : '-'}</td><td>{payment.note || '-'}</td><td><button className="button secondary" type="button" onClick={() => setSelectedPayment(payment)}>Ver</button></td></tr>)}</tbody></table></div>
    </div>
  );
}
