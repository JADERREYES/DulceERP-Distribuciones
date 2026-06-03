import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { exportToCsv, formatCurrency, formatDate } from '../utils/exportUtils';

const reasons = ['vencimiento', 'daño', 'perdida', 'rotura', 'contaminacion', 'ajuste', 'otro'];
const initialFilters = { product: '', batch: '', reason: '', from: '', to: '', search: '' };

export default function Wastes() {
  const [wastes, setWastes] = useState([]);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({ product: '', batch: '', quantity: 1, reason: 'vencimiento', description: '' });
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [selectedWaste, setSelectedWaste] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedBatch = useMemo(() => batches.find((batch) => batch._id === form.batch), [batches, form.batch]);
  const selectedProduct = useMemo(() => products.find((product) => product._id === form.product), [products, form.product]);
  const estimatedCost = Number(form.quantity || 0) * Number(selectedBatch?.unitCost || selectedProduct?.unitCost || 0);

  const queryString = (currentFilters = filters) => {
    const params = new URLSearchParams({ limit: '100' });
    Object.entries(currentFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  };

  const load = async (currentFilters = filters) => {
    const [wasteRes, productRes, batchRes] = await Promise.all([
      api.get(`/wastes?${queryString(currentFilters)}`),
      api.get('/products?limit=100'),
      api.get('/batches?limit=100')
    ]);
    setWastes(wasteRes.data.data || wasteRes.data);
    setProducts(productRes.data.data || productRes.data);
    setBatches(batchRes.data.data || batchRes.data);
  };

  const loadBatches = async (productId) => {
    if (!productId) {
      setBatches([]);
      return;
    }
    const res = await api.get(`/batches/product/${productId}`);
    setBatches(res.data.filter((batch) => Number(batch.availableQuantity) > 0));
  };

  useEffect(() => { load().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando mermas.')); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api.post('/wastes', { ...form, batch: form.batch || undefined, quantity: Number(form.quantity) });
      setForm({ product: '', batch: '', quantity: 1, reason: 'vencimiento', description: '' });
      setShowForm(false);
      setSuccess('Merma registrada correctamente.');
      await load();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || err.response?.data?.error || 'Error registrando merma.');
    }
  };

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const applyFilters = () => load().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error consultando mermas.'));

  const clearFilters = () => {
    setFilters(initialFilters);
    load(initialFilters).catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error consultando mermas.'));
  };

  const exportWastes = () => {
    const ok = exportToCsv('mermas-filtradas.csv', wastes.map((waste) => ({
      Fecha: formatDate(waste.createdAt),
      Producto: waste.product?.name || '',
      SKU: waste.product?.sku || '',
      Lote: waste.batchNumber || waste.batch?.batchNumber || '',
      Cantidad: waste.quantity,
      Razon: waste.reason,
      'Costo total': waste.totalCost || 0,
      Descripcion: waste.description || ''
    })));
    if (!ok) setError('No hay mermas para exportar.');
  };

  const startWaste = () => {
    setForm({ product: '', batch: '', quantity: 1, reason: 'vencimiento', description: '' });
    setError('');
    setSuccess('');
    setShowForm(true);
  };

  return (
    <div className="page-stack report-print-area">
      <div className="page-title"><h2>Mermas</h2><p>Registro de vencimientos, daños, perdidas y ajustes de inventario.</p></div>
      <div className="notice warning">Las mermas no se eliminan desde este modulo. Cualquier correccion debe hacerse con reverso controlado y auditoria.</div>

      <div className="module-toolbar no-print">
        <button className="button primary" type="button" onClick={startWaste}>Registrar merma</button>
        <select value={filters.product} onChange={(e) => updateFilter('product', e.target.value)}>
          <option value="">Todos los productos</option>
          {products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
        </select>
        <select value={filters.batch} onChange={(e) => updateFilter('batch', e.target.value)}>
          <option value="">Todos los lotes</option>
          {batches.map((batch) => <option key={batch._id} value={batch._id}>{batch.batchNumber}</option>)}
        </select>
        <select value={filters.reason} onChange={(e) => updateFilter('reason', e.target.value)}>
          <option value="">Todos los motivos</option>
          {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={(e) => updateFilter('from', e.target.value)} />
        <input type="date" value={filters.to} onChange={(e) => updateFilter('to', e.target.value)} />
        <input placeholder="Buscar descripcion" value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} />
        <button className="button primary" type="button" onClick={applyFilters}>Consultar</button>
        <button className="button secondary" type="button" onClick={clearFilters}>Limpiar</button>
        <button className="button secondary" type="button" onClick={exportWastes}>Exportar</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>

      {showForm && <form className="form-grid no-print" onSubmit={submit}>
        <div className="section-heading wide"><h3>Registrar merma</h3><span>Descuenta inventario con trazabilidad</span></div>
        <label>Producto<select value={form.product} onChange={(e) => { setForm({ ...form, product: e.target.value, batch: '' }); loadBatches(e.target.value); }} required><option value="">Seleccionar</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} - Stock {product.stock}</option>)}</select></label>
        <label>Lote<select value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })}><option value="">Sin lote especifico</option>{batches.filter((batch) => !form.product || batch.product?._id === form.product || batch.product === form.product).map((batch) => <option key={batch._id} value={batch._id}>{batch.batchNumber} - Disp. {batch.availableQuantity}</option>)}</select></label>
        <label>Cantidad<input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></label>
        <label>Razon<select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>{reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label>
        <label>Descripcion<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="inline-total">Costo estimado: {formatCurrency(estimatedCost)}</div>
        <button className="button primary" type="submit">Registrar merma</button>
        <button className="button ghost" type="button" onClick={() => setShowForm(false)}>Cancelar</button>
      </form>}

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      {selectedWaste && (
        <div className="detail-panel">
          <h3>Detalle merma</h3>
          <p>{selectedWaste.product?.name} - {selectedWaste.reason} - {formatCurrency(selectedWaste.totalCost)}</p>
          <p>Lote: {selectedWaste.batchNumber || selectedWaste.batch?.batchNumber || '-'}. Cantidad: {selectedWaste.quantity}.</p>
          <p>{selectedWaste.description || 'Sin descripcion.'}</p>
          <button className="button ghost" type="button" onClick={() => setSelectedWaste(null)}>Cerrar detalle</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Producto</th><th>Lote</th><th>Cantidad</th><th>Razon</th><th>Costo total</th><th>Descripcion</th><th className="no-print">Accion</th></tr></thead>
          <tbody>
            {wastes.length === 0 && <tr><td colSpan="8">No hay mermas para los filtros seleccionados.</td></tr>}
            {wastes.map((waste) => (
              <tr key={waste._id}>
                <td>{formatDate(waste.createdAt)}</td>
                <td>{waste.product?.name}</td>
                <td>{waste.batchNumber || waste.batch?.batchNumber || '-'}</td>
                <td>{waste.quantity}</td>
                <td>{waste.reason}</td>
                <td>{formatCurrency(waste.totalCost)}</td>
                <td>{waste.description || '-'}</td>
                <td className="no-print"><button className="button secondary" type="button" onClick={() => setSelectedWaste(waste)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
