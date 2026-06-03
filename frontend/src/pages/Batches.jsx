import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { exportToCsv, formatCurrency, formatDate } from '../utils/exportUtils';

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
  const [expiredWithStock, setExpiredWithStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [filters, setFilters] = useState({ search: '', product: '', status: '', supplier: '', from: '', to: '' });
  const [selectedExpiredBatch, setSelectedExpiredBatch] = useState(null);
  const [wasteForm, setWasteForm] = useState({ quantity: '', description: 'Merma por lote vencido' });
  const [blockReason, setBlockReason] = useState('');
  const [expirationForm, setExpirationForm] = useState({ expirationDate: '', reason: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    const [batchRes, productRes, supplierRes, expiredRes] = await Promise.all([api.get('/batches?limit=100'), api.get('/products?limit=100'), api.get('/suppliers?limit=100'), api.get('/batches/expired-with-stock')]);
    setBatches(batchRes.data.data || batchRes.data);
    setProducts(productRes.data.data || productRes.data);
    setSuppliers(supplierRes.data.data || supplierRes.data);
    setExpiredWithStock(expiredRes.data.data || expiredRes.data);
  };

  useEffect(() => {
    load().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando lotes.'));
  }, []);

  const selectExpiredBatch = (batch) => {
    setSelectedExpiredBatch(batch);
    setWasteForm({ quantity: batch.availableQuantity, description: `Merma por vencimiento lote ${batch.batchNumber}` });
    setBlockReason('Producto vencido pendiente de revision');
    setExpirationForm({ expirationDate: '', reason: '' });
    setError('');
    setSuccess('');
  };

  const registerWasteFromBatch = async () => {
    setError('');
    setSuccess('');
    if (!selectedExpiredBatch) return setError('Seleccione un lote vencido.');
    const quantity = Number(wasteForm.quantity);
    if (!quantity || quantity <= 0) return setError('La cantidad debe ser mayor que cero.');
    if (quantity > Number(selectedExpiredBatch.availableQuantity)) return setError('La cantidad no puede superar la disponible del lote.');
    const ok = window.confirm(`Confirma registrar merma por ${quantity} unidad(es) del lote ${selectedExpiredBatch.batchNumber}? Esta accion descuenta stock y lote.`);
    if (!ok) return;
    try {
      await api.post('/wastes/from-batch', {
        batchId: selectedExpiredBatch._id,
        quantity,
        reason: 'vencimiento',
        description: wasteForm.description
      });
      setSuccess('Merma registrada desde lote vencido.');
      setSelectedExpiredBatch(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || err.userMessage || 'Error registrando merma desde lote.');
    }
  };

  const blockBatch = async () => {
    setError('');
    setSuccess('');
    if (!selectedExpiredBatch) return setError('Seleccione un lote vencido.');
    if (!blockReason.trim()) return setError('Debe indicar la razon para bloquear el lote.');
    const ok = window.confirm(`Confirma bloquear el lote ${selectedExpiredBatch.batchNumber}? No se modifica stock.`);
    if (!ok) return;
    try {
      await api.patch(`/batches/${selectedExpiredBatch._id}/block`, { reason: blockReason });
      setSuccess('Lote bloqueado correctamente.');
      setSelectedExpiredBatch(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || err.userMessage || 'Error bloqueando lote.');
    }
  };

  const correctExpirationDate = async () => {
    setError('');
    setSuccess('');
    if (!selectedExpiredBatch) return setError('Seleccione un lote vencido.');
    if (!expirationForm.expirationDate) return setError('Debe indicar la nueva fecha de vencimiento.');
    if (!expirationForm.reason.trim()) return setError('Debe indicar la razon de la correccion.');
    const ok = window.confirm('Use esta accion solo si la fecha fue digitada incorrectamente. No debe usarse para vender producto vencido. Desea continuar?');
    if (!ok) return;
    try {
      await api.patch(`/batches/${selectedExpiredBatch._id}/expiration-date`, expirationForm);
      setSuccess('Fecha de vencimiento corregida con auditoria.');
      setSelectedExpiredBatch(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || err.userMessage || 'Error corrigiendo vencimiento.');
    }
  };

  const filtered = useMemo(() => batches.filter((batch) => {
    const text = `${batch.batchNumber} ${batch.product?.name || ''} ${batch.product?.sku || ''}`.toLowerCase();
    return (!filters.search || text.includes(filters.search.toLowerCase()))
      && (!filters.product || batch.product?._id === filters.product)
      && (!filters.status || batch.status === filters.status)
      && (!filters.supplier || batch.supplier?._id === filters.supplier)
      && (!filters.from || new Date(batch.expirationDate) >= new Date(filters.from))
      && (!filters.to || new Date(batch.expirationDate) <= new Date(`${filters.to}T23:59:59`));
  }), [batches, filters]);

  const exportBatches = () => {
    const ok = exportToCsv('lotes-filtrados.csv', filtered.map((batch) => ({
      Lote: batch.batchNumber,
      Producto: batch.product?.name || '',
      SKU: batch.product?.sku || '',
      Proveedor: batch.supplier?.name || '',
      Inicial: batch.initialQuantity,
      Disponible: batch.availableQuantity,
      Costo: batch.unitCost,
      Vencimiento: formatDate(batch.expirationDate),
      Estado: batch.status
    })));
    if (!ok) setError('No hay lotes para exportar.');
  };

  return (
    <div className="page-stack">
      <div className="page-title"><h2>Lotes</h2><p>Trazabilidad FEFO, cantidades disponibles y vencimientos.</p></div>
      <div className="module-toolbar">
        <input placeholder="Buscar lote, producto o SKU" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select value={filters.product} onChange={(e) => setFilters({ ...filters, product: e.target.value })}>
          <option value="">Todos los productos</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Todos los estados</option><option value="disponible">Disponible</option><option value="proximo_vencer">Proximo a vencer</option><option value="vencido">Vencido</option><option value="agotado">Agotado</option><option value="bloqueado">Bloqueado</option>
        </select>
        <select value={filters.supplier} onChange={(e) => setFilters({ ...filters, supplier: e.target.value })}>
          <option value="">Todos los proveedores</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <button className="button primary" type="button" onClick={load}>Actualizar</button>
        <button className="button secondary" type="button" onClick={exportBatches}>Exportar</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      <section className="page-stack">
        <div className="section-heading">
          <h3>Lotes vencidos con stock</h3>
          <span>{expiredWithStock.length} lote(s) requieren gestion</span>
        </div>
        <div className="notice danger">Estos lotes no deben venderse. Gestione cada caso como merma, bloqueo o correccion autorizada de vencimiento.</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th>SKU</th><th>Lote</th><th>Disponible</th><th>Vencimiento</th><th>Dias vencido</th><th>Costo unitario</th><th>Costo total</th><th>Proveedor</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {expiredWithStock.length === 0 && <tr><td colSpan="11">No hay lotes vencidos con stock disponible.</td></tr>}
              {expiredWithStock.map((batch) => (
                <tr key={batch._id} className="row-bloqueado">
                  <td>{batch.productName || batch.product?.name}</td>
                  <td>{batch.sku || batch.product?.sku}</td>
                  <td>{batch.batchNumber}</td>
                  <td>{batch.availableQuantity}</td>
                  <td>{new Date(batch.expirationDate).toLocaleDateString('es-CO')}</td>
                  <td>{batch.daysExpired}</td>
                  <td>{money.format(batch.unitCost)}</td>
                  <td>{formatCurrency(batch.totalCost)}</td>
                  <td>{batch.supplier?.name || '-'}</td>
                  <td><span className={`badge ${batch.status}`}>{batch.status}</span></td>
                  <td><button className="button secondary" type="button" onClick={() => selectExpiredBatch(batch)}>Gestionar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedExpiredBatch && (
          <div className="form-grid">
            <div className="notice info wide">Lote seleccionado: {selectedExpiredBatch.batchNumber} - {selectedExpiredBatch.productName || selectedExpiredBatch.product?.name}. Cantidad maxima disponible: {selectedExpiredBatch.availableQuantity}.</div>
            <label>Cantidad merma<input type="number" min="1" max={selectedExpiredBatch.availableQuantity} value={wasteForm.quantity} onChange={(e) => setWasteForm({ ...wasteForm, quantity: e.target.value })} /></label>
            <label>Descripcion merma<input value={wasteForm.description} onChange={(e) => setWasteForm({ ...wasteForm, description: e.target.value })} /></label>
            <button className="button danger" type="button" onClick={registerWasteFromBatch}>Registrar merma</button>
            <label>Razon bloqueo<input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} /></label>
            <button className="button secondary" type="button" onClick={blockBatch}>Bloquear lote</button>
            <div className="notice warning wide">Use esta accion solo si la fecha fue digitada incorrectamente. No debe usarse para vender producto vencido.</div>
            <label>Nueva fecha vencimiento<input type="date" value={expirationForm.expirationDate} onChange={(e) => setExpirationForm({ ...expirationForm, expirationDate: e.target.value })} /></label>
            <label>Razon correccion<input value={expirationForm.reason} onChange={(e) => setExpirationForm({ ...expirationForm, reason: e.target.value })} /></label>
            <button className="button secondary" type="button" onClick={correctExpirationDate}>Corregir vencimiento</button>
          </div>
        )}
      </section>

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
