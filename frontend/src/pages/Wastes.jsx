import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const reasons = ['vencimiento', 'daño', 'perdida', 'rotura', 'contaminacion', 'ajuste', 'otro'];

export default function Wastes() {
  const [wastes, setWastes] = useState([]);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({ product: '', batch: '', quantity: 1, reason: 'vencimiento', description: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedBatch = useMemo(() => batches.find((batch) => batch._id === form.batch), [batches, form.batch]);
  const estimatedCost = Number(form.quantity || 0) * Number(selectedBatch?.unitCost || products.find((product) => product._id === form.product)?.unitCost || 0);

  const load = async () => {
    const [wasteRes, productRes] = await Promise.all([api.get('/wastes'), api.get('/products')]);
    setWastes(wasteRes.data.data || wasteRes.data);
    setProducts(productRes.data.data || productRes.data);
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
      setBatches([]);
      setSuccess('Merma registrada correctamente.');
      await load();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || err.response?.data?.error || 'Error registrando merma.');
    }
  };

  return (
    <div className="page-stack">
      <div className="page-title"><h2>Mermas</h2><p>Registro de vencimientos, daños, pérdidas y ajustes de inventario.</p></div>
      <form className="form-grid" onSubmit={submit}>
        <label>Producto<select value={form.product} onChange={(e) => { setForm({ ...form, product: e.target.value, batch: '' }); loadBatches(e.target.value); }} required><option value="">Seleccionar</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} - Stock {product.stock}</option>)}</select></label>
        <label>Lote<select value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })}><option value="">Sin lote especifico</option>{batches.map((batch) => <option key={batch._id} value={batch._id}>{batch.batchNumber} - Disp. {batch.availableQuantity}</option>)}</select></label>
        <label>Cantidad<input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></label>
        <label>Razon<select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>{reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label>
        <label>Descripcion<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="inline-total">Costo estimado: {money.format(estimatedCost)}</div>
        <button className="button primary" type="submit">Registrar merma</button>
      </form>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Producto</th><th>Lote</th><th>Cantidad</th><th>Razon</th><th>Costo total</th><th>Descripcion</th></tr></thead>
          <tbody>{wastes.map((waste) => <tr key={waste._id}><td>{new Date(waste.createdAt).toLocaleDateString('es-CO')}</td><td>{waste.product?.name}</td><td>{waste.batchNumber || '-'}</td><td>{waste.quantity}</td><td>{waste.reason}</td><td>{money.format(waste.totalCost)}</td><td>{waste.description || '-'}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
