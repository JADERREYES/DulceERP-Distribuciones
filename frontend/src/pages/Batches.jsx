import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const daysToExpire = (date) => {
  if (!date) return '-';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiration = new Date(date);
  expiration.setHours(0, 0, 0, 0);
  return Math.ceil((expiration - today) / 86400000);
};

export default function Batches() {
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState({ search: '', product: '', status: '' });
  const [error, setError] = useState('');

  const load = async () => {
    const [batchRes, productRes] = await Promise.all([api.get('/batches'), api.get('/products')]);
    setBatches(batchRes.data.data || batchRes.data);
    setProducts(productRes.data.data || productRes.data);
  };

  useEffect(() => {
    load().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando lotes.'));
  }, []);

  const filtered = useMemo(() => batches.filter((batch) => {
    const text = `${batch.batchNumber} ${batch.product?.name || ''} ${batch.product?.sku || ''}`.toLowerCase();
    return (!filters.search || text.includes(filters.search.toLowerCase()))
      && (!filters.product || batch.product?._id === filters.product)
      && (!filters.status || batch.status === filters.status);
  }), [batches, filters]);

  return (
    <div className="page-stack">
      <div className="page-title"><h2>Lotes</h2><p>Trazabilidad FEFO, cantidades disponibles y vencimientos.</p></div>
      <div className="module-toolbar">
        <input placeholder="Buscar lote, producto o SKU" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select value={filters.product} onChange={(e) => setFilters({ ...filters, product: e.target.value })}>
          <option value="">Todos los productos</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Todos los estados</option><option value="disponible">Disponible</option><option value="proximo_vencer">Proximo a vencer</option><option value="vencido">Vencido</option><option value="agotado">Agotado</option>
        </select>
        <button className="button primary" type="button" onClick={load}>Actualizar</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Lote</th><th>Producto</th><th>Proveedor</th><th>Inicial</th><th>Disponible</th><th>Costo</th><th>Vencimiento</th><th>Dias</th><th>Estado</th></tr></thead>
          <tbody>
            {filtered.map((batch) => (
              <tr key={batch._id}>
                <td>{batch.batchNumber}</td>
                <td>{batch.product?.name}</td>
                <td>{batch.supplier?.name || '-'}</td>
                <td>{batch.initialQuantity}</td>
                <td>{batch.availableQuantity}</td>
                <td>{money.format(batch.unitCost)}</td>
                <td>{new Date(batch.expirationDate).toLocaleDateString('es-CO')}</td>
                <td>{daysToExpire(batch.expirationDate)}</td>
                <td><span className={`badge ${batch.status}`}>{batch.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
