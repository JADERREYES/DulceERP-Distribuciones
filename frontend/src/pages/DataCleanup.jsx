import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const cleanupCollections = ['products', 'customers', 'suppliers', 'sales', 'purchases', 'payments', 'supplierPayments', 'expenses', 'batches', 'wastes'];

export default function DataCleanup() {
  const { user } = useAuth();
  const [detected, setDetected] = useState(null);
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null);
  const [productsWithoutBatches, setProductsWithoutBatches] = useState([]);
  const [productsSummary, setProductsSummary] = useState({ totalProducts: 0, totalMissingQuantity: 0 });
  const [suppliers, setSuppliers] = useState([]);
  const [batchForm, setBatchForm] = useState({ productId: '', batchNumber: '', quantity: '', expirationDate: '', unitCost: '', supplierId: '', notes: '', override: false });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const batchFormRef = useRef(null);

  const groupedDetected = useMemo(() => {
    if (!detected) return [];
    return cleanupCollections.map((collection) => ({ collection, items: detected[collection] || [] })).filter((group) => group.items.length > 0);
  }, [detected]);

  const selectedProduct = productsWithoutBatches.find((product) => product.productId === batchForm.productId);

  const requireAdmin = user?.role === 'admin';

  const loadProductsWithoutBatches = async () => {
    setError('');
    const res = await api.get('/data-cleanup/products-without-batches');
    setProductsWithoutBatches(res.data.data || []);
    setProductsSummary(res.data.summary || { totalProducts: 0, totalMissingQuantity: 0 });
  };

  const loadSuppliers = async () => {
    const res = await api.get('/suppliers');
    setSuppliers(res.data.data || res.data);
  };

  useEffect(() => {
    if (requireAdmin) {
      Promise.all([loadProductsWithoutBatches(), loadSuppliers()]).catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando limpieza de datos.'));
    }
  }, [requireAdmin]);

  if (!requireAdmin) {
    return <div className="notice danger">No tienes permisos para ver limpieza de datos.</div>;
  }

  const detectDemo = async () => {
    setError('');
    setMessage('');
    const res = await api.get('/data-cleanup/detect-demo');
    setDetected(res.data);
    setSelected([]);
  };

  const toggleItem = (collection, id) => {
    const key = `${collection}:${id}`;
    setSelected((current) =>
      current.some((item) => item.key === key)
        ? current.filter((item) => item.key !== key)
        : [...current, { key, collection, id }]
    );
  };

  const markSelected = async () => {
    setError('');
    setMessage('');
    if (selected.length === 0) {
      setError('Selecciona registros para marcar como demo.');
      return;
    }
    const ok = window.confirm('Esto NO borra datos. Solo marcara los registros seleccionados como demo. Deseas continuar?');
    if (!ok) return;
    const res = await api.post('/data-cleanup/mark-demo', { items: selected.map(({ collection, id }) => ({ collection, id })), confirm: true });
    setMessage(`Registros marcados como demo: ${res.data.markedCount}`);
    await detectDemo();
  };

  const loadDeletePreview = async () => {
    setError('');
    setMessage('');
    const res = await api.post('/data-cleanup/delete-demo-preview', { collections: cleanupCollections, onlyMarkedDemo: true });
    setPreview(res.data);
  };

  const deleteSafe = async () => {
    setError('');
    setMessage('');
    const ok = window.confirm('Esta accion eliminara SOLO registros isDemo=true clasificados como seguros y sin relaciones. No elimina ventas, compras, kardex ni pagos relacionados. Deseas continuar?');
    if (!ok) return;
    const res = await api.post('/data-cleanup/delete-demo-apply', { confirm: true, deleteOnlySafe: true });
    setMessage(`Eliminados seguros: ${res.data.deletedCount}. Bloqueados: ${res.data.blocked?.length || 0}`);
    await loadDeletePreview();
  };

  const selectProductForInitialBatch = (product) => {
    setBatchForm({
      productId: product.productId,
      batchNumber: '',
      quantity: product.missingBatchQuantity,
      expirationDate: '',
      unitCost: product.unitCost,
      supplierId: '',
      notes: 'Carga inicial real autorizada',
      override: false
    });
    setMessage(`Producto seleccionado para lote inicial: ${product.name}`);
    setError('');
    setTimeout(() => batchFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const validateBatchForm = () => {
    if (!batchForm.productId) return 'Seleccione un producto.';
    if (!batchForm.batchNumber.trim()) return 'El numero de lote es obligatorio.';
    const quantity = Number(batchForm.quantity);
    if (!quantity || quantity <= 0) return 'La cantidad debe ser mayor que cero.';
    if (selectedProduct && quantity > Number(selectedProduct.missingBatchQuantity) && !batchForm.override) return 'La cantidad no puede superar el faltante.';
    if (!batchForm.expirationDate) return 'La fecha de vencimiento es obligatoria.';
    const unitCost = Number(batchForm.unitCost);
    if (!unitCost || unitCost <= 0) return 'El costo unitario debe ser mayor que cero.';
    return '';
  };

  const createInitialBatch = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const validationMessage = validateBatchForm();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    if (selectedProduct && Number(batchForm.quantity) > Number(selectedProduct.missingBatchQuantity) && batchForm.override) {
      const overrideOk = window.confirm('La cantidad supera el faltante. Confirma que tienes autorizacion expresa para usar override?');
      if (!overrideOk) return;
    }
    const ok = window.confirm('Esta accion no aumenta stock. Solo asigna un lote real al stock historico existente. Confirma que los datos son reales?');
    if (!ok) return;
    const payload = {
      ...batchForm,
      quantity: Number(batchForm.quantity),
      unitCost: Number(batchForm.unitCost),
      supplierId: batchForm.supplierId || undefined,
      confirm: batchForm.override === true
    };
    const res = await api.post('/data-cleanup/create-initial-batch', payload);
    setMessage(`Lote inicial real creado: ${res.data.batch?.batchNumber || batchForm.batchNumber}. Faltante actualizado: ${res.data.missingBatchQuantity}`);
    setBatchForm({ productId: '', batchNumber: '', quantity: '', expirationDate: '', unitCost: '', supplierId: '', notes: '', override: false });
    await loadProductsWithoutBatches();
    try {
      await api.get('/dashboard/alerts');
    } catch (err) {
      // La carga del dashboard no debe afectar el resultado de creacion.
    }
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Limpieza de datos</h2>
        <p>Operacion con datos reales, deteccion de demo y carga inicial de lotes historicos.</p>
      </div>
      <div className="notice warning">No borres registros con relaciones contables o inventario. Haz respaldo antes de aplicar cualquier eliminacion.</div>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <section className="page-stack">
        <h3>Deteccion de datos demo</h3>
        <div className="module-toolbar">
          <button className="button primary" type="button" onClick={detectDemo}>Detectar posibles datos demo</button>
          <button className="button secondary" type="button" onClick={markSelected}>Marcar seleccionados como demo</button>
        </div>
        {detected && <p>Total posibles demo: {detected.summary?.totalPossibleDemoRecords || 0}</p>}
        {groupedDetected.map((group) => (
          <div className="table-wrap" key={group.collection}>
            <table>
              <thead><tr><th colSpan="5">{group.collection}</th></tr><tr><th></th><th>Nombre</th><th>Razon</th><th>Relaciones</th><th>Advertencia</th></tr></thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td><input type="checkbox" checked={selected.some((selectedItem) => selectedItem.key === `${item.collection}:${item.id}`)} onChange={() => toggleItem(item.collection, item.id)} /></td>
                    <td>{item.name}</td>
                    <td>{item.reason}</td>
                    <td>{item.hasRelations ? 'Si' : 'No'}</td>
                    <td>{item.warning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="page-stack">
        <h3>Vista previa de eliminacion demo</h3>
        <div className="notice danger">Zona peligrosa: No elimine registros con relaciones contables o de inventario. Use esta opcion solo con respaldo y autorizacion.</div>
        <div className="module-toolbar">
          <button className="button primary" type="button" onClick={loadDeletePreview}>Vista previa de eliminacion demo</button>
        </div>
        {preview && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Clasificacion</th><th>Coleccion</th><th>Nombre</th><th>Razon</th><th>Advertencia</th></tr></thead>
              <tbody>
                {[...preview.safeToDelete, ...preview.riskyToDelete, ...preview.blocked].map((item) => (
                  <tr key={`${item.collection}-${item.id}`}>
                    <td><span className={`badge ${item.classification === 'safeToDelete' ? 'disponible' : 'bloqueado'}`}>{item.classification}</span></td>
                    <td>{item.collection}</td>
                    <td>{item.name}</td>
                    <td>{item.reason}</td>
                    <td>{item.warning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview && (
          <div className="danger-zone">
            <button className="button danger" type="button" onClick={deleteSafe}>Eliminar solo registros seguros</button>
          </div>
        )}
      </section>

      <section className="page-stack">
        <h3>Productos con stock sin lotes suficientes</h3>
        <div className="module-toolbar">
          <button className="button primary" type="button" onClick={loadProductsWithoutBatches}>Buscar productos sin lotes suficientes</button>
          <span className="inline-total">Productos pendientes: {productsSummary.totalProducts || productsWithoutBatches.length}</span>
          <span className="inline-total">Unidades faltantes: {productsSummary.totalMissingQuantity || productsWithoutBatches.reduce((sum, product) => sum + Number(product.missingBatchQuantity || 0), 0)}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th>SKU</th><th>Stock</th><th>Lotes disponibles</th><th>Faltante</th><th>Costo</th><th>Accion</th></tr></thead>
            <tbody>
              {productsWithoutBatches.map((product) => (
                <tr key={product.productId}>
                  <td>{product.name}</td>
                  <td>{product.sku}</td>
                  <td>{product.stock}</td>
                  <td>{product.batchesAvailable}</td>
                  <td>{product.missingBatchQuantity}</td>
                  <td>{money.format(product.unitCost)}</td>
                  <td><button className="button secondary" type="button" onClick={() => selectProductForInitialBatch(product)}>Crear lote real</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form className="form-grid" onSubmit={createInitialBatch} ref={batchFormRef}>
          <div className="notice warning">Esta accion NO aumenta stock. Solo asigna lote real al stock historico existente.</div>
          {selectedProduct && (
            <div className="notice info">
              Producto seleccionado: {selectedProduct.name} ({selectedProduct.sku}). Stock actual: {selectedProduct.stock}. Lotes disponibles: {selectedProduct.batchesAvailable}. Cantidad faltante y maxima permitida: {selectedProduct.missingBatchQuantity}. Costo sugerido: {money.format(selectedProduct.unitCost)}.
            </div>
          )}
          <label>Producto<select value={batchForm.productId} onChange={(e) => {
            const product = productsWithoutBatches.find((item) => item.productId === e.target.value);
            setBatchForm({ ...batchForm, productId: e.target.value, quantity: product?.missingBatchQuantity || '', unitCost: product?.unitCost || '', override: false });
          }} required><option value="">Seleccionar</option>{productsWithoutBatches.map((product) => <option key={product.productId} value={product.productId}>{product.name} - faltan {product.missingBatchQuantity}</option>)}</select></label>
          <label>Numero de lote<input value={batchForm.batchNumber} onChange={(e) => setBatchForm({ ...batchForm, batchNumber: e.target.value })} required /></label>
          <label>Cantidad<input type="number" min="1" value={batchForm.quantity} onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })} required /></label>
          <label>Vencimiento<input type="date" value={batchForm.expirationDate} onChange={(e) => setBatchForm({ ...batchForm, expirationDate: e.target.value })} required /></label>
          <label>Costo unitario<input type="number" min="1" value={batchForm.unitCost} onChange={(e) => setBatchForm({ ...batchForm, unitCost: e.target.value })} required /></label>
          <label>Proveedor opcional<select value={batchForm.supplierId} onChange={(e) => setBatchForm({ ...batchForm, supplierId: e.target.value })}><option value="">Sin proveedor</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}</select></label>
          <label>Notas<input value={batchForm.notes} onChange={(e) => setBatchForm({ ...batchForm, notes: e.target.value })} placeholder="Carga inicial real autorizada" /></label>
          {selectedProduct && Number(batchForm.quantity) > Number(selectedProduct.missingBatchQuantity) && (
            <label className="notice danger">
              <input type="checkbox" checked={batchForm.override} onChange={(e) => setBatchForm({ ...batchForm, override: e.target.checked })} />
              Autorizar override admin: la cantidad supera el faltante detectado.
            </label>
          )}
          <button className="button primary" type="submit">Crear lote inicial real</button>
        </form>
      </section>
    </div>
  );
}
