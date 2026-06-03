import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { exportToCsv } from '../utils/exportUtils';

const initialForm = { name: '', document: '', phone: '', email: '', contactName: '', city: '', address: '', creditLimit: 0, paymentTermDays: 30 };
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '', city: '', debt: '', from: '', to: '' });

  const load = () => api.get('/suppliers').then(({ data }) => setSuppliers(data.data || data));
  useEffect(() => { load().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando proveedores.')); }, []);

  const filteredSuppliers = useMemo(() => suppliers.filter((supplier) => {
    const q = filters.search.toLowerCase();
    const text = `${supplier.name || ''} ${supplier.document || ''} ${supplier.phone || ''} ${supplier.email || ''}`.toLowerCase();
    const createdAt = supplier.createdAt ? new Date(supplier.createdAt) : null;
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(filters.to) : null;
    if (to) to.setHours(23, 59, 59, 999);
    return (!q || text.includes(q))
      && (!filters.status || supplier.status === filters.status)
      && (!filters.city || (supplier.city || '').toLowerCase().includes(filters.city.toLowerCase()))
      && (!filters.debt || (filters.debt === 'withDebt' ? Number(supplier.currentDebt || 0) > 0 : Number(supplier.currentDebt || 0) <= 0))
      && (!from || (createdAt && createdAt >= from))
      && (!to || (createdAt && createdAt <= to));
  }), [suppliers, filters]);

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
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error creando proveedor.');
    }
  };

  const editSupplier = (supplier) => {
    setEditingId(supplier._id);
    setShowForm(true);
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

  const startNewSupplier = () => {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(true);
    setError('');
  };

  const cancelForm = () => {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(false);
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
    const ok = exportToCsv('proveedores-filtrados.csv', filteredSuppliers.map((supplier) => ({
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
        <button className="button primary" type="button" onClick={startNewSupplier}>Nuevo proveedor</button>
        <input id="supplier-filter-search" name="filterSearch" placeholder="Buscar proveedor, NIT o contacto" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select id="supplier-filter-status" name="filterStatus" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="riesgo">Riesgo</option>
          <option value="bloqueado">Bloqueado</option>
        </select>
        <input id="supplier-filter-city" name="filterCity" placeholder="Ciudad" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
        <select id="supplier-filter-debt" name="filterDebt" value={filters.debt} onChange={(e) => setFilters({ ...filters, debt: e.target.value })}>
          <option value="">Todas las deudas</option>
          <option value="withDebt">Con deuda</option>
          <option value="withoutDebt">Sin deuda</option>
        </select>
        <input id="supplier-filter-from" name="filterFrom" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input id="supplier-filter-to" name="filterTo" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <button className="button secondary" type="button" onClick={exportSuppliers}>Exportar</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>
      {showForm && <form className="form-grid" onSubmit={submit}>
        <div className="section-heading wide"><h3>{editingId ? 'Editando proveedor' : 'Nuevo proveedor'}</h3><span>Datos básicos y cupo</span></div>
        <label htmlFor="supplier-name">Nombre / razon social<input id="supplier-name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label htmlFor="supplier-document">NIT / Documento<input id="supplier-document" name="document" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} required /></label>
        <label htmlFor="supplier-phone">Telefono<input id="supplier-phone" name="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label htmlFor="supplier-email">Email<input id="supplier-email" name="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label htmlFor="supplier-contact-name">Contacto<input id="supplier-contact-name" name="contactName" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></label>
        <label htmlFor="supplier-city">Ciudad<input id="supplier-city" name="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <label className="wide" htmlFor="supplier-address">Direccion<input id="supplier-address" name="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label htmlFor="supplier-credit-limit">Cupo credito<input id="supplier-credit-limit" name="creditLimit" type="number" min="0" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} /></label>
        <label htmlFor="supplier-payment-term-days">Plazo dias<input id="supplier-payment-term-days" name="paymentTermDays" type="number" min="0" value={form.paymentTermDays} onChange={(e) => setForm({ ...form, paymentTermDays: Number(e.target.value) })} /></label>
        <div className="notice info wide">La deuda actual del proveedor es de solo lectura y cambia por compras credito, pagos o anulaciones.</div>
        <button className="button primary" type="submit">{editingId ? 'Guardar cambios' : 'Crear proveedor'}</button>
        <button className="button ghost" type="button" onClick={cancelForm}>Cancelar</button>
      </form>}
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
        {filteredSuppliers.length === 0 && <tr><td colSpan="7">No hay proveedores todavía. Usa el botón Nuevo proveedor para crear el primero.</td></tr>}
        {filteredSuppliers.map((supplier) => <tr key={supplier._id} className={`row-${supplier.status}`}><td>{supplier.name}</td><td>{supplier.document}</td><td>{supplier.city || '-'}</td><td>{money.format(supplier.creditLimit)}</td><td>{money.format(supplier.currentDebt)}</td><td><span className={`badge ${supplier.status}`}>{supplier.status}</span></td><td><button className="button secondary" type="button" onClick={() => setSelectedSupplier(supplier)}>Ver</button><button className="button secondary" type="button" onClick={() => editSupplier(supplier)}>Editar</button><button className="button danger" type="button" onClick={() => deleteSupplier(supplier)}>Eliminar</button></td></tr>)}
      </tbody></table></div>
    </div>
  );
}
