import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const cleanupCollections = ['products', 'customers', 'suppliers', 'sales', 'purchases', 'payments', 'supplierPayments', 'expenses', 'batches', 'wastes'];

export default function DataCleanup() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('diagnostico');
  const [readiness, setReadiness] = useState(null);
  const [detected, setDetected] = useState(null);
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null);
  const [resetPreview, setResetPreview] = useState(null);
  const [resetForm, setResetForm] = useState({ confirmationText: '', reason: '', authorized: false });
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

  const backendMessage = (err, fallback) => err.userMessage || err.response?.data?.message || err.response?.data?.error || fallback;

  const loadReadiness = async () => {
    setError('');
    setMessage('');
    const res = await api.get('/data-cleanup/real-readiness');
    setReadiness(res.data);
  };

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
      Promise.all([loadReadiness(), loadProductsWithoutBatches(), loadSuppliers()]).catch((err) => setError(backendMessage(err, 'Error cargando limpieza de datos.')));
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
    const res = await api.post('/data-cleanup/mark-demo', {
      records: selected.map(({ collection, id }) => ({ collection, id })),
      reason: 'Datos de prueba identificados antes de operacion real'
    });
    setMessage(`Registros marcados como demo: ${res.data.markedCount}`);
    await detectDemo();
    await loadReadiness();
  };

  const loadDeletePreview = async () => {
    setError('');
    setMessage('');
    const res = await api.post('/data-cleanup/demo-cleanup-preview', { collections: cleanupCollections, patterns: ['prueba', 'demo', 'auditoria', 'test', 'FC-AUD', 'LOTE-F5'], includeMarkedDemo: true });
    setPreview(res.data);
  };

  const deleteSafe = async () => {
    setError('');
    setMessage('');
    const ok = window.confirm('Esta accion eliminara SOLO registros isDemo=true clasificados como seguros y sin relaciones. No elimina ventas, compras, kardex ni pagos relacionados. Deseas continuar?');
    if (!ok) return;
    const res = await api.post('/data-cleanup/delete-demo-apply', {
      confirm: true,
      onlySafe: true,
      deleteOnlySafe: true,
      reason: 'Limpieza de datos demo antes de operacion real'
    });
    setMessage(`Eliminados seguros: ${res.data.deletedCount}. Bloqueados: ${res.data.blocked?.length || 0}`);
    await loadDeletePreview();
    await loadReadiness();
  };

  const loadResetPreview = async () => {
    setError('');
    setMessage('');
    const res = await api.post('/data-cleanup/reset-operational-preview', {});
    setResetPreview(res.data);
  };

  const applyReset = async () => {
    setError('');
    setMessage('');
    if (!resetForm.authorized) {
      setError('Debe confirmar que estos datos son de prueba y tiene autorizacion.');
      return;
    }
    const ok = window.confirm('PELIGRO: Esta accion reinicia datos operativos. Solo continue si tiene autorizacion y respaldo.');
    if (!ok) return;
    try {
      const res = await api.post('/data-cleanup/reset-operational-apply', {
        confirm: true,
        confirmationText: resetForm.confirmationText,
        keepUsers: true,
        keepAdmins: true,
        reason: resetForm.reason
      });
      setMessage(res.data.message || 'Reinicio operativo aplicado.');
      await loadReadiness();
      await loadResetPreview();
    } catch (err) {
      setError(backendMessage(err, 'No se pudo aplicar el reinicio operativo.'));
    }
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

      <div className="dashboard-tabs">
        <button className={activeTab === 'diagnostico' ? 'active' : ''} type="button" onClick={() => setActiveTab('diagnostico')}>Diagnóstico</button>
        <button className={activeTab === 'demo' ? 'active' : ''} type="button" onClick={() => setActiveTab('demo')}>Datos demo</button>
        <button className={activeTab === 'segura' ? 'active' : ''} type="button" onClick={() => setActiveTab('segura')}>Limpieza segura</button>
        <button className={activeTab === 'reset' ? 'active' : ''} type="button" onClick={() => setActiveTab('reset')}>Reinicio operación real</button>
      </div>

      {activeTab === 'diagnostico' && (
      <section className="page-stack">
        <h3>Diagnóstico para operación real</h3>
        <div className="module-toolbar">
          <button className="button primary" type="button" onClick={loadReadiness}>Actualizar diagnóstico</button>
        </div>
        {readiness && (
          <>
            <div className="kpi-grid">
              <div className="kpi-card"><span>Ventas</span><strong>{readiness.collectionsCount?.sales || 0}</strong></div>
              <div className="kpi-card"><span>Compras</span><strong>{readiness.collectionsCount?.purchases || 0}</strong></div>
              <div className="kpi-card"><span>Pagos</span><strong>{(readiness.collectionsCount?.payments || 0) + (readiness.collectionsCount?.supplierPayments || 0)}</strong></div>
              <div className="kpi-card"><span>Lotes vencidos</span><strong>{readiness.inventory?.expiredBatchesWithStock?.length || 0}</strong></div>
              <div className="kpi-card"><span>Diferencias stock/lotes</span><strong>{readiness.inventory?.stockVsBatches?.length || 0}</strong></div>
              <div className="kpi-card"><span>Admin activos</span><strong>{readiness.users?.activeAdminCount || 0}</strong></div>
            </div>

            <div className="table-wrap">
              <table>
                <thead><tr><th>Colección</th><th>Total</th><th>Marcados demo</th></tr></thead>
                <tbody>
                  {Object.entries(readiness.collectionsCount || {}).map(([collection, count]) => (
                    <tr key={collection}><td>{collection}</td><td>{count}</td><td>{readiness.demoMarked?.[collection] || 0}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="notice warning">
              Posibles demo: {readiness.possibleDemo?.summary?.totalPossibleDemoRecords || 0}. Bloqueados/riesgosos: {(readiness.blockedRecords?.length || 0) + (readiness.riskyRecords?.length || 0)}.
            </div>
            <div className="notice info">
              Clientes con deuda: {readiness.financial?.customersWithDebt?.length || 0}. Proveedores con deuda: {readiness.financial?.suppliersWithDebt?.length || 0}.
            </div>
            {readiness.recommendations?.map((recommendation) => <div className="notice info" key={recommendation}>{recommendation}</div>)}
          </>
        )}

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
      )}

      {activeTab === 'demo' && (
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
      )}

      {activeTab === 'segura' && (
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
      )}

      {activeTab === 'reset' && (
      <section className="page-stack danger-zone">
        <h3>Reinicio controlado de operación real</h3>
        <div className="notice danger">Esta acción elimina datos operativos para iniciar con datos reales. No elimina usuarios admin. Debe hacerse solo si todos los datos actuales son de prueba y existe respaldo.</div>
        <div className="module-toolbar">
          <button className="button secondary" type="button" onClick={loadResetPreview}>Vista previa de reinicio</button>
        </div>
        {resetPreview && (
          <>
            {!resetPreview.enabled && <div className="notice danger">El reinicio operativo está deshabilitado por seguridad.</div>}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Colección</th><th>Registros que se borrarían</th></tr></thead>
                <tbody>
                  {Object.entries(resetPreview.counts || {}).map(([collection, count]) => <tr key={collection}><td>{collection}</td><td>{count}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="notice info">Se conservan usuarios: {resetPreview.preserved?.users}. Admin activos: {resetPreview.preserved?.activeAdmins}. Auditoría: {resetPreview.preserved?.auditLogs}</div>
          </>
        )}
        <div className="form-grid">
          <label className="wide">Texto obligatorio<input value={resetForm.confirmationText} onChange={(e) => setResetForm({ ...resetForm, confirmationText: e.target.value })} placeholder="REINICIAR DATOS OPERATIVOS" /></label>
          <label className="wide">Razón<textarea value={resetForm.reason} onChange={(e) => setResetForm({ ...resetForm, reason: e.target.value })} placeholder="Inicio de operación con datos reales" /></label>
          <label className="notice danger wide">
            <input type="checkbox" checked={resetForm.authorized} onChange={(e) => setResetForm({ ...resetForm, authorized: e.target.checked })} />
            Confirmo que estos datos son de prueba y tengo autorización.
          </label>
          <button
            className="button danger"
            type="button"
            onClick={applyReset}
            disabled={!resetPreview?.enabled || !resetForm.authorized || resetForm.confirmationText !== 'REINICIAR DATOS OPERATIVOS' || !resetForm.reason.trim()}
          >
            Reiniciar datos operativos
          </button>
        </div>
        <div className="notice info">
          Flujo recomendado después de limpiar: crear proveedores reales, productos reales, registrar compras reales con lote y vencimiento, validar FEFO, registrar ventas, pagos, revisar Kardex y conciliación.
        </div>
      </section>
      )}
    </div>
  );
}
