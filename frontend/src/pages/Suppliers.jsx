import { useEffect, useState } from 'react';
import api from '../api/axios';

const initialForm = { name: '', document: '', phone: '', email: '', contactName: '', city: '', address: '', creditLimit: 0, paymentTermDays: 30 };
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');

  const load = () => api.get('/suppliers').then(({ data }) => setSuppliers(data.data || data));
  useEffect(() => { load().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando proveedores.')); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.post('/suppliers', form);
      setForm(initialForm);
      await load();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error creando proveedor.');
    }
  };

  return (
    <div className="page-stack">
      <div className="page-title"><h2>Proveedores</h2><p>Empresas que abastecen mercancia a la distribuidora.</p></div>
      <form className="form-grid" onSubmit={submit}>
        <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>NIT / Documento<input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} required /></label>
        <label>Telefono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Contacto<input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></label>
        <label>Ciudad<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <label>Cupo credito<input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} /></label>
        <label>Plazo dias<input type="number" value={form.paymentTermDays} onChange={(e) => setForm({ ...form, paymentTermDays: Number(e.target.value) })} /></label>
        <button className="button primary" type="submit">Crear proveedor</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap"><table><thead><tr><th>Proveedor</th><th>NIT</th><th>Ciudad</th><th>Cupo</th><th>Deuda</th><th>Estado</th></tr></thead><tbody>
        {suppliers.map((supplier) => <tr key={supplier._id} className={`row-${supplier.status}`}><td>{supplier.name}</td><td>{supplier.document}</td><td>{supplier.city || '-'}</td><td>{money.format(supplier.creditLimit)}</td><td>{money.format(supplier.currentDebt)}</td><td><span className={`badge ${supplier.status}`}>{supplier.status}</span></td></tr>)}
      </tbody></table></div>
    </div>
  );
}
