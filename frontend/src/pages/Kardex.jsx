import { useEffect, useState } from 'react';
import api from '../api/axios';
import { exportToCsv, formatCurrency, formatDate } from '../utils/exportUtils';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const initialFilters = { product: '', type: '', from: '', to: '', batch: '', reference: '' };

export default function Kardex() {
  const [movements, setMovements] = useState([]);
  const [costs, setCosts] = useState([]);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [error, setError] = useState('');

  const queryString = (currentFilters = filters) => {
    const params = new URLSearchParams({ limit: '100' });
    Object.entries(currentFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  };

  const load = async (currentFilters = filters) => {
    setError('');
    const query = queryString(currentFilters);
    const [movementsRes, costsRes] = await Promise.all([api.get(`/kardex?${query}`), api.get(`/kardex/cost-history?${query}`)]);
    setMovements(movementsRes.data.data || movementsRes.data);
    setCosts(costsRes.data.data || costsRes.data);
  };

  const loadCatalogs = async () => {
    const [productsRes, batchesRes] = await Promise.all([api.get('/products?limit=100'), api.get('/batches?limit=100')]);
    setProducts(productsRes.data.data || productsRes.data);
    setBatches(batchesRes.data.data || batchesRes.data);
  };

  useEffect(() => {
    Promise.all([load(), loadCatalogs()]).catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando kardex.'));
  }, []);

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const clearFilters = () => {
    setFilters(initialFilters);
    load(initialFilters).catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando kardex.'));
  };

  const exportMovements = () => {
    const ok = exportToCsv('kardex-filtrado.csv', movements.map((movement) => ({
      Fecha: formatDate(movement.createdAt, true),
      Producto: movement.product?.name || '',
      SKU: movement.product?.sku || '',
      Lote: movement.batchNumber || movement.batch?.batchNumber || '',
      Tipo: movement.type,
      Cantidad: movement.quantity,
      'Stock anterior': movement.previousStock,
      'Stock nuevo': movement.newStock,
      Referencia: [movement.referenceType, movement.referenceId].filter(Boolean).join(' '),
      Descripcion: movement.description || ''
    })));
    if (!ok) setError('No hay movimientos para exportar.');
  };

  return (
    <div className="page-stack">
      <div className="page-title"><h2>Kardex</h2><p>Historial de entradas, salidas, anulaciones y costos.</p></div>
      <div className="module-toolbar">
        <select value={filters.product} onChange={(e) => updateFilter('product', e.target.value)}>
          <option value="">Todos los productos</option>
          {products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
        </select>
        <select value={filters.type} onChange={(e) => updateFilter('type', e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="entrada_compra">Entrada compra</option>
          <option value="salida_venta">Salida venta</option>
          <option value="devolucion_anulacion">Devolucion anulacion</option>
          <option value="anulacion_compra">Anulacion compra</option>
          <option value="ajuste">Ajuste</option>
          <option value="merma">Merma</option>
          <option value="carga_inicial_lote">Carga inicial lote</option>
        </select>
        <input type="date" value={filters.from} onChange={(e) => updateFilter('from', e.target.value)} />
        <input type="date" value={filters.to} onChange={(e) => updateFilter('to', e.target.value)} />
        <select value={filters.batch} onChange={(e) => updateFilter('batch', e.target.value)}>
          <option value="">Todos los lotes</option>
          {batches.map((batch) => <option key={batch._id} value={batch._id}>{batch.batchNumber}</option>)}
        </select>
        <input placeholder="Referencia o descripcion" value={filters.reference} onChange={(e) => updateFilter('reference', e.target.value)} />
        <button className="button primary" type="button" onClick={() => load()}>Consultar</button>
        <button className="button secondary" type="button" onClick={clearFilters}>Limpiar filtros</button>
        <button className="button secondary" type="button" onClick={exportMovements}>Exportar</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Lote</th><th>Tipo</th><th>Cantidad</th><th>Stock anterior</th><th>Stock nuevo</th><th>Referencia</th><th>Descripcion</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement._id}><td>{new Date(movement.createdAt).toLocaleString('es-CO')}</td><td>{movement.product?.name}</td><td>{movement.batchNumber || movement.batch?.batchNumber || '-'}</td><td><span className="badge info">{movement.type}</span></td><td>{movement.quantity}</td><td>{movement.previousStock}</td><td>{movement.newStock}</td><td>{movement.referenceType}</td><td>{movement.description}</td></tr>)}</tbody></table></div>
      <div className="table-wrap"><table><thead><tr><th colSpan="6">Costos historicos</th></tr><tr><th>Fecha</th><th>Producto</th><th>Proveedor</th><th>Costo anterior</th><th>Costo nuevo</th><th>Cantidad</th></tr></thead><tbody>{costs.map((cost) => <tr key={cost._id}><td>{formatDate(cost.createdAt)}</td><td>{cost.product?.name}</td><td>{cost.supplier?.name || '-'}</td><td>{formatCurrency(cost.previousCost) || money.format(cost.previousCost)}</td><td>{formatCurrency(cost.newCost) || money.format(cost.newCost)}</td><td>{cost.quantity}</td></tr>)}</tbody></table></div>
    </div>
  );
}
