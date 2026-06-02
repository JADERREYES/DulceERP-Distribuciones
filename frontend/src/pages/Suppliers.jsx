import { useEffect, useState } from 'react';
import api from '../api/axios';
import { exportToCsv } from '../utils/exportUtils';

const initialForm = { name: '', document: '', phone: '', email: '', contactName: '', city: '', address: '', creditLimit: 0, paymentTermDays: 30 };
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/suppliers').then(({ data }) => setSuppliers(data.data || data));
  useEffect(() => { load().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando proveedores.')); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/suppliers/${editingId}`, form);
      } else {
        await api.post('/suppliers', form);
      }
      setForm(initialForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error creando proveedor.');
    }
  };

  const editSupplier = (supplier) => {
    setEditingId(supplier._id);
    setForm({
      name: supplier.name || '',
      document: supplier.document || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      contactName: supplier.contactName || '',
      city: supplier.city || '',
      address: supplier.address || '',
      creditLimit: Number(supplier.creditLimit || 0),
      paymentTermDays: Number(supplier.paymentTermDays || 30)
    });
  };

  const deleteSupplier = async (supplier) => {
    if (!window.confirm(`Eliminar proveedor "${supplier.name}" solo es permitido si no tiene compras, pagos ni deuda. Continuar?`)) return;
    try {
      await api.delete(`/suppliers/${supplier._id}`);
      await load();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || err.response?.data?.error || 'Error eliminando proveedor.');
    }
  };

  const exportSuppliers = () => {
    const ok = exportToCsv('proveedores.csv', suppliers.map((supplier) => ({
      Proveedor: supplier.name,
      NIT: supplier.document,
      Telefono: supplier.phone || '',
      Email: supplier.email || '',
      Ciudad: supplier.city || '',
      Cupo: supplier.creditLimit,
      Deuda: supplier.currentDebt,
      Estado: supplier.status
    })));
    if (!ok) setError('No hay proveedores para exportar.');
  };

  return (
    <div className="page-stack">
      <div className="page-title"><h2>Proveedores</h2><p>Empresas que abastecen mercancia a la distribuidora.</p></div>
      <div className="module-toolbar">
        <button className="button secondary" type="button" onClick={exportSuppliers}>Exportar</button>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>NIT / Documento<input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} required /></label>
        <label>Telefono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Contacto<input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></label>
        <label>Ciudad<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <label>Cupo credito<input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} /></label>
        <label>Plazo dias<input type="number" value={form.paymentTermDays} onChange={(e) => setForm({ ...form, paymentTermDays: Number(e.target.value) })} /></label>
        <button className="button primary" type="submit">{editingId ? 'Guardar cambios' : 'Crear proveedor'}</button>
        {editingId && <button className="button ghost" type="button" onClick={() => { setEditingId(null); setForm(initialForm); }}>Cancelar edicion</button>}
      </form>
      {error && <p className="error">{error}</p>}
      {selectedSupplier && (
        <div className="detail-panel">
          <h3>Detalle proveedor</h3>
          <p>{selectedSupplier.name} - {selectedSupplier.document} - {selectedSupplier.status}</p>
          <p>Contacto: {selectedSupplier.contactName || '-'} / {selectedSupplier.phone || '-'} / {selectedSupplier.email || '-'}</p>
          <p>Deuda actual: {money.format(selectedSupplier.currentDebt)}</p>
          <button className="button ghost" type="button" onClick={() => setSelectedSupplier(null)}>Cerrar detalle</button>
        </div>
      )}
      <div className="table-wrap"><table><thead><tr><th>Proveedor</th><th>NIT</th><th>Ciudad</th><th>Cupo</th><th>Deuda</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {suppliers.map((supplier) => <tr key={supplier._id} className={`row-${supplier.status}`}><td>{supplier.name}</td><td>{supplier.document}</td><td>{supplier.city || '-'}</td><td>{money.format(supplier.creditLimit)}</td><td>{money.format(supplier.currentDebt)}</td><td><span className={`badge ${supplier.status}`}>{supplier.status}</span></td><td><button className="button secondary" type="button" onClick={() => setSelectedSupplier(supplier)}>Ver</button><button className="button secondary" type="button" onClick={() => editSupplier(supplier)}>Editar</button><button className="button danger" type="button" onClick={() => deleteSupplier(supplier)}>Eliminar</button></td></tr>)}
      </tbody></table></div>
    </div>
  );
}
