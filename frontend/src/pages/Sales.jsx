import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { exportToCsv, formatDate } from '../utils/exportUtils';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Sales() {
  const { user } = useAuth();
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [sellableProducts, setSellableProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [expiringBatches, setExpiringBatches] = useState([]);
  const [form, setForm] = useState({ customer: '', product: '', quantity: 1, unitPrice: '', paymentMethod: 'contado', routeZone: '', note: '' });
  const [showForm, setShowForm] = useState(false);
  const [orderItems, setOrderItems] = useState([]);
  const [lastSale, setLastSale] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationSummary, setValidationSummary] = useState(null);
  const [saleFilters, setSaleFilters] = useState({ customer: '', status: '', paymentMethod: '', paymentStatus: '', from: '', to: '' });
  const [selectedSale, setSelectedSale] = useState(null);
  const [selectedProductAvailability, setSelectedProductAvailability] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [showNonSellableBatches, setShowNonSellableBatches] = useState(false);
  const [sellableLoading, setSellableLoading] = useState(false);
  const [sellableSummary, setSellableSummary] = useState(null);
  const [sellableFilters, setSellableFilters] = useState({ search: '', category: '', onlyAvailable: 'true' });
  const [quickQuantities, setQuickQuantities] = useState({});

  const selectedProduct = useMemo(
    () => products.find((product) => product._id === form.product) || sellableProducts.find((product) => product._id === form.product),
    [products, sellableProducts, form.product]
  );
  const selectedProductExpiringBatches = useMemo(() => expiringBatches.filter((batch) => batch.product?._id === form.product), [expiringBatches, form.product]);
  const selectedCustomer = useMemo(() => customers.find((customer) => customer._id === form.customer), [customers, form.customer]);
  const total = orderItems.reduce((sum, item) => sum + item.quantity * item.salePrice, 0);
  const estimatedProfit = orderItems.reduce((sum, item) => sum + item.quantity * (item.salePrice - item.unitCost), 0);
  const totalQuantity = orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const filteredSales = sales;
  const canCreateSale = ['admin', 'vendedor'].includes(user?.role);
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const loadData = async () => {
    const params = new URLSearchParams({ limit: '100' });
    Object.entries(saleFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const [salesRes, productsRes, customersRes, batchesRes] = await Promise.all([
      api.get(`/sales?${params.toString()}`),
      api.get('/products?limit=100'),
      api.get('/customers?limit=100'),
      api.get('/batches/expiring')
    ]);

    setSales(salesRes.data.data || salesRes.data);
    setProducts(productsRes.data.data || productsRes.data);
    setCustomers(customersRes.data.data || customersRes.data);
    setExpiringBatches(batchesRes.data.data || batchesRes.data);
  };

  const loadSellableProducts = async () => {
    setSellableLoading(true);
    const params = new URLSearchParams({ page: '1', limit: '100' });
    Object.entries(sellableFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    try {
      const { data } = await api.get(`/products/sellable?${params.toString()}`);
      setSellableProducts(data.data || []);
      setSellableSummary(data.summary || null);
    } catch (err) {
      setError(backendMessage(err, 'Error cargando productos disponibles para venta.'));
    } finally {
      setSellableLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([loadData(), loadSellableProducts()]).catch((err) => setError(err.response?.data?.message || 'Error cargando ventas.'));
  }, []);

  useEffect(() => {
    setSelectedProductAvailability(null);
    setShowNonSellableBatches(false);
    if (!form.product) return;

    let cancelled = false;
    setAvailabilityLoading(true);
    api
      .get(`/products/${form.product}/sale-availability`)
      .then(({ data }) => {
        if (!cancelled) setSelectedProductAvailability(data);
      })
      .catch((err) => {
        if (!cancelled) setError(backendMessage(err, 'Error consultando disponibilidad FEFO del producto.'));
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.product]);

  const addSellableProduct = (product) => {
    setError('');
    setSuccess('');

    const quantity = Number(quickQuantities[product._id] || 1);
    const sellableQuantity = Number(product.sellableQuantity || 0);
    if (!quantity || quantity < 1) {
      setError('La cantidad debe ser mayor que cero.');
      return;
    }
    if (sellableQuantity <= 0) {
      setError('Sin lotes disponibles para venta.');
      setForm((current) => ({ ...current, product: product._id, unitPrice: product.salePrice ?? '' }));
      return;
    }

    const existing = orderItems.find((item) => item.product === product._id);
    const requestedQuantity = quantity + Number(existing?.quantity || 0);
    if (requestedQuantity > sellableQuantity) {
      setError(`Solo hay ${sellableQuantity} unidades vendibles para este producto.`);
      setForm((current) => ({ ...current, product: product._id, unitPrice: product.salePrice ?? '' }));
      return;
    }

    if (existing) {
      setOrderItems((items) =>
        items.map((item) =>
          item.product === product._id ? { ...item, quantity: item.quantity + quantity } : item
        )
      );
    } else {
      setOrderItems((items) => [
        ...items,
        {
          product: product._id,
          name: product.name,
          sku: product.sku,
          quantity,
          salePrice: Number(product.salePrice),
          unitCost: Number(product.unitCost || 0),
          stock: Number(product.generalStock || 0),
          maxSellableQuantity: sellableQuantity
        }
      ]);
    }

    setForm((current) => ({ ...current, product: product._id, unitPrice: product.salePrice ?? '', quantity: 1 }));
    setQuickQuantities((current) => ({ ...current, [product._id]: 1 }));
    setSuccess(`${product.name} agregado al pedido.`);
  };

  const removeItem = (productId) => {
    setOrderItems((items) => items.filter((item) => item.product !== productId));
  };

  const buildSalePayload = () => ({
    customer: form.customer,
    paymentMethod: form.paymentMethod,
    routeZone: form.routeZone,
    note: form.note || '',
    items: orderItems.map((item) => ({
      product: item.product,
      quantity: Number(item.quantity),
      unitPrice: Number(item.salePrice)
    }))
  });

  const backendMessage = (err, fallback) =>
    err.response?.data?.message ||
    err.response?.data?.error ||
    err.userMessage ||
    fallback;

  const validateBeforeSend = () => {
    if (!form.customer) return 'Seleccione un cliente.';
    if (!form.paymentMethod) return 'Seleccione una forma de pago.';
    if (!form.routeZone || !String(form.routeZone).trim()) return 'Seleccione zona o ruta.';
    if (orderItems.length === 0) return 'Agregue al menos un producto.';

    for (const item of orderItems) {
      if (!item.product) return 'Seleccione un producto valido.';
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) return 'La cantidad debe ser mayor que cero.';
      if (!Number.isFinite(Number(item.salePrice)) || Number(item.salePrice) <= 0) return 'El precio de venta debe ser mayor que cero.';
      if (Number(item.stock) <= 0) return 'El producto no tiene stock disponible.';
      if (Number(item.quantity) > Number(item.stock)) return `Stock insuficiente para ${item.name}. Disponible: ${item.stock}`;
      if (item.maxSellableQuantity !== undefined && Number(item.quantity) > Number(item.maxSellableQuantity)) {
        return `Solo hay ${item.maxSellableQuantity} unidades vendibles por lotes disponibles para ${item.name}.`;
      }
    }
    return '';
  };

  const validateSaleWithBackend = async () => {
    setError('');
    setSuccess('');
    setValidationSummary(null);

    const localError = validateBeforeSend();
    if (localError) {
      setError(localError);
      return null;
    }

    const payload = buildSalePayload();
    if (import.meta.env.DEV) console.log('Payload venta', payload);

    try {
      const validationRes = await api.post('/sales/validate', payload);
      setValidationSummary(validationRes.data.summary);
      setSuccess(validationRes.data.message || 'La venta es valida y puede registrarse.');
      return validationRes.data;
    } catch (err) {
      if (import.meta.env.DEV && err.response?.data?.details) console.log('Detalles validacion venta', err.response.data.details);
      const msg = backendMessage(err, 'No se pudo validar la venta.');
      const hint = msg.includes('No hay lotes disponibles suficientes') ? ' Revise lotes vencidos, stock sin lote o disponibilidad FEFO.' : '';
      setError(`${msg}${hint}`);
      return null;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setValidationSummary(null);

    const validation = await validateSaleWithBackend();
    if (!validation?.ok) return;

    try {
      const payload = buildSalePayload();
      if (import.meta.env.DEV) console.log('Payload venta', payload);
      const saleRes = await api.post('/sales', payload);

      setLastSale(saleRes.data);
      setForm({ customer: '', product: '', quantity: 1, unitPrice: '', paymentMethod: 'contado', routeZone: '', note: '' });
      setOrderItems([]);
      setShowForm(false);
      setValidationSummary(null);
      setSuccess('Venta registrada correctamente. Lotes asignados por FEFO.');
      await loadData();
    } catch (err) {
      if (import.meta.env.DEV && err.response?.data?.details) console.log('Detalles error venta', err.response.data.details);
      const msg = backendMessage(err, 'No se pudo registrar la venta.');
      const hint = msg.includes('No hay lotes disponibles suficientes') ? ' Revise lotes vencidos, stock sin lote o disponibilidad FEFO.' : '';
      setError(`${msg}${hint}`);
    }
  };

  const cancelSale = async (saleId) => {
    setError('');
    setSuccess('');
    if (!window.confirm('Anular una venta devuelve stock a inventario y ajusta cartera pendiente si aplica. Continua solo si ya verificaste la venta.')) return;

    try {
      await api.patch(`/sales/${saleId}/cancel`);
      setSuccess('Venta anulada correctamente.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Error anulando venta.');
    }
  };

  const exportSales = () => {
    const ok = exportToCsv('ventas-filtradas.csv', filteredSales.map((sale) => ({
      Fecha: formatDate(sale.createdAt),
      Cliente: sale.customer?.name || '',
      Total: sale.total,
      Pagado: sale.paidAmount || 0,
      Saldo: sale.balance || 0,
      Costo: sale.totalCost || 0,
      Utilidad: sale.grossProfit || 0,
      'Forma pago': sale.paymentMethod,
      'Estado pago': sale.paymentStatus,
      'Estado venta': sale.status || 'activa',
      Ruta: sale.routeZone || ''
    })));
    if (!ok) setError('No hay ventas para exportar.');
  };

  const updateSaleFilter = (field, value) => setSaleFilters((current) => ({ ...current, [field]: value }));
  const updateSellableFilter = (field, value) => setSellableFilters((current) => ({ ...current, [field]: value }));

  const startNewSale = () => {
    if (!canCreateSale) {
      setError('No tienes permisos para registrar ventas.');
      return;
    }
    setForm({ customer: '', product: '', quantity: 1, unitPrice: '', paymentMethod: 'contado', routeZone: '', note: '' });
    setOrderItems([]);
    setValidationSummary(null);
    setSelectedProductAvailability(null);
    setShowNonSellableBatches(false);
    setError('');
    setSuccess('');
    setShowForm(true);
    loadSellableProducts();
  };

  const cancelNewSale = () => {
    setForm({ customer: '', product: '', quantity: 1, unitPrice: '', paymentMethod: 'contado', routeZone: '', note: '' });
    setOrderItems([]);
    setValidationSummary(null);
    setSelectedProductAvailability(null);
    setShowNonSellableBatches(false);
    setShowForm(false);
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Ventas</h2>
        <p>Pedidos multiproducto con inventario, costo de venta, utilidad y cartera.</p>
      </div>

      <div className="module-toolbar">
        {canCreateSale && <button className="button primary" type="button" onClick={startNewSale}>Nueva venta</button>}
        {canCreateSale && <button className="button secondary" type="button" onClick={validateSaleWithBackend} disabled={!showForm}>Validar venta</button>}
        <button className="button secondary" type="button" onClick={exportSales}>Exportar</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>

      {showForm && <form className="form-grid" onSubmit={handleSubmit}>
        <div className="section-heading wide"><h3>Nueva venta</h3><span>Valide inventario antes de guardar</span></div>
        <label htmlFor="sale-customer">Cliente<select id="sale-customer" name="customer" value={form.customer} onChange={(e) => {
          const customer = customers.find((item) => item._id === e.target.value);
          setForm({ ...form, customer: e.target.value, routeZone: customer?.zone || form.routeZone });
        }} required>
          <option value="">Seleccionar</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name} - {customer.status}</option>)}
        </select></label>
        <label htmlFor="sale-payment-method">Forma de pago<select id="sale-payment-method" name="paymentMethod" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
          <option value="">Seleccionar</option><option value="contado">Contado</option><option value="credito">Credito</option>
        </select></label>
        <label htmlFor="sale-route-zone">Zona/ruta<input id="sale-route-zone" name="routeZone" value={form.routeZone} onChange={(e) => setForm({ ...form, routeZone: e.target.value })} required /></label>
        <div className="section-heading wide"><h3>Productos disponibles para venta</h3><span>Venta rapida por lotes FEFO vendibles</span></div>
        <label htmlFor="sale-product-search">Buscar producto<input id="sale-product-search" name="productSearch" value={sellableFilters.search} onChange={(e) => updateSellableFilter('search', e.target.value)} placeholder="Nombre, SKU o categoria" /></label>
        <label htmlFor="sale-product-category">Categoria<select id="sale-product-category" name="productCategory" value={sellableFilters.category} onChange={(e) => updateSellableFilter('category', e.target.value)}>
          <option value="">Todas</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select></label>
        <label htmlFor="sale-product-availability">Disponibilidad<select id="sale-product-availability" name="onlyAvailable" value={sellableFilters.onlyAvailable} onChange={(e) => updateSellableFilter('onlyAvailable', e.target.value)}>
          <option value="true">Solo vendibles</option>
          <option value="false">Busqueda avanzada</option>
        </select></label>
        <div className="module-toolbar wide">
          <button className="button secondary" type="button" onClick={loadSellableProducts} disabled={sellableLoading}>{sellableLoading ? 'Actualizando...' : 'Actualizar'}</button>
          <a className="button ghost" href="/purchases">Ir a Compras</a>
          <a className="button ghost" href="/batches">Ir a Lotes</a>
          <a className="button ghost" href="/data-cleanup">Ir a Limpieza de datos</a>
          <a className="button ghost" href="/reconciliation">Ir a Conciliacion</a>
        </div>
        {sellableSummary && (
          <div className="notice info wide">
            Productos vendibles: {sellableSummary.sellableProducts} | Unidades vendibles: {sellableSummary.totalSellableUnits} | Con vencidos: {sellableSummary.expiredProducts} | Con bloqueados: {sellableSummary.blockedProducts}
          </div>
        )}
        <div className="table-wrap wide">
          <table>
            <thead>
              <tr><th>Producto</th><th>SKU</th><th>Precio venta</th><th>Disponible para vender</th><th>Proximo vencimiento</th><th>Estado</th><th>Cantidad a vender</th><th>Accion</th></tr>
            </thead>
            <tbody>
              {!sellableLoading && sellableProducts.length === 0 && (
                <tr><td colSpan="8">No hay productos con lotes disponibles para venta. Revise compras, lotes, vencimientos o limpieza de datos.</td></tr>
              )}
              {sellableLoading && <tr><td colSpan="8">Cargando productos disponibles...</td></tr>}
              {sellableProducts.map((product) => (
                <tr key={product._id}>
                  <td>
                    <button
                      className="link-button"
                      type="button"
                      title={`Stock general: ${product.generalStock} | Vendible: ${product.sellableQuantity} | No vendible: ${Number(product.expiredQuantity || 0) + Number(product.blockedQuantity || 0)}`}
                      onClick={() => setForm((current) => ({ ...current, product: product._id, unitPrice: product.salePrice ?? '' }))}
                    >
                      {product.name}
                    </button>
                    {!product.canSell && <div className="muted-text">Sin lotes disponibles para venta.</div>}
                  </td>
                  <td>{product.sku}</td>
                  <td>{money.format(product.salePrice)}</td>
                  <td>{product.sellableQuantity} disponibles</td>
                  <td>{product.nextExpirationDate ? formatDate(product.nextExpirationDate) : '-'}</td>
                  <td><span className={`badge ${product.canSell ? 'disponible' : 'agotado'}`}>{product.canSell ? 'Disponible' : 'No vendible'}</span></td>
                  <td>
                    <input
                      id={`sale-quick-quantity-${product._id}`}
                      name={`quickQuantity-${product._id}`}
                      type="number"
                      min="1"
                      max={Math.max(Number(product.sellableQuantity || 0), 1)}
                      value={quickQuantities[product._id] || 1}
                      onChange={(e) => setQuickQuantities((current) => ({ ...current, [product._id]: e.target.value }))}
                      disabled={!product.canSell}
                    />
                  </td>
                  <td>
                    <button className="button secondary" type="button" onClick={() => addSellableProduct(product)} disabled={!product.canSell}>Agregar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="wide" htmlFor="sale-note">Nota<textarea id="sale-note" name="note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <div className="inline-total">Total pedido: {money.format(total)}</div>
        <div className="inline-total">Utilidad estimada: {money.format(estimatedProfit)}</div>
        <div className="inline-total">Cantidad total: {totalQuantity}</div>
        {canCreateSale && <button className="button secondary" type="button" onClick={validateSaleWithBackend}>Validar venta</button>}
        {canCreateSale && <button className="button primary" type="submit">Guardar venta</button>}
        <button className="button ghost" type="button" onClick={cancelNewSale}>Cancelar</button>
      </form>}
      {selectedCustomer && <div className="notice info">Zona sugerida: {selectedCustomer.zone}. Cupo disponible: {money.format(Number(selectedCustomer.creditLimit) - Number(selectedCustomer.currentDebt))}</div>}
      {selectedProduct && <div className={`notice ${selectedProduct.status === 'agotado' ? 'danger' : selectedProduct.status === 'bajo_stock' || selectedProduct.status === 'proximo_vencer' ? 'warning' : 'info'}`}>Stock general: {selectedProduct.stock ?? selectedProduct.generalStock}. Vendible: {selectedProduct.sellableQuantity ?? selectedProductAvailability?.availability?.maxSellableQuantity ?? '-'}. Precio: {money.format(selectedProduct.salePrice)}. Estado: {selectedProduct.status}. La disponibilidad por lotes se valida con FEFO antes de guardar.</div>}
      {availabilityLoading && <div className="notice info">Consultando disponibilidad FEFO del producto...</div>}
      {selectedProductAvailability && (
        <div className="detail-panel">
          <h3>Disponibilidad FEFO</h3>
          <p>{selectedProductAvailability.product.name} - {selectedProductAvailability.product.sku}</p>
          <div className="kpi-grid">
            <div className="kpi-card"><span>Stock general</span><strong>{selectedProductAvailability.availability.generalStock}</strong></div>
            <div className="kpi-card"><span>Vendible por lotes</span><strong>{selectedProductAvailability.availability.sellableBatchQuantity}</strong></div>
            <div className="kpi-card"><span>No vendible</span><strong>{selectedProductAvailability.availability.expiredBatchQuantity + selectedProductAvailability.availability.blockedBatchQuantity}</strong></div>
            <div className="kpi-card"><span>Máximo vendible</span><strong>{selectedProductAvailability.availability.maxSellableQuantity}</strong></div>
          </div>

          {selectedProductAvailability.availability.sellableBatchQuantity < selectedProductAvailability.availability.generalStock && (
            <div className="notice warning">El producto tiene stock general, pero no todos sus lotes son vendibles.</div>
          )}
          {Number(form.quantity) > Number(selectedProductAvailability.availability.maxSellableQuantity) && (
            <div className="notice danger">Solo hay {selectedProductAvailability.availability.maxSellableQuantity} unidades vendibles por lotes disponibles.</div>
          )}
          {selectedProductAvailability.availability.maxSellableQuantity <= 0 && (
            <div className="notice danger">Este producto no tiene lotes disponibles para venta.</div>
          )}

          {selectedProductAvailability.warnings?.length > 0 && (
            <ul>
              {selectedProductAvailability.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}

          {selectedProductAvailability.sellableBatches?.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Lote vendible</th><th>Cantidad</th><th>Vencimiento</th><th>Días para vencer</th></tr></thead>
                <tbody>
                  {selectedProductAvailability.sellableBatches.map((batch) => (
                    <tr key={batch._id}>
                      <td>{batch.batchNumber}</td>
                      <td>{batch.availableQuantity}</td>
                      <td>{formatDate(batch.expirationDate)}</td>
                      <td>{batch.daysToExpire}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedProductAvailability.nonSellableBatches?.length > 0 && (
            <>
              <button className="button ghost" type="button" onClick={() => setShowNonSellableBatches((current) => !current)}>
                {showNonSellableBatches ? 'Ocultar lotes no vendibles' : 'Ver lotes no vendibles'}
              </button>
              {showNonSellableBatches && (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Lote</th><th>Cantidad</th><th>Estado</th><th>Vencimiento</th><th>Motivo</th></tr></thead>
                    <tbody>
                      {selectedProductAvailability.nonSellableBatches.map((batch) => (
                        <tr key={batch._id}>
                          <td>{batch.batchNumber}</td>
                          <td>{batch.availableQuantity}</td>
                          <td><span className={`badge ${batch.status}`}>{batch.status}</span></td>
                          <td>{formatDate(batch.expirationDate)}</td>
                          <td>{batch.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {selectedProductAvailability.recommendations?.length > 0 && (
            <div className="notice info">
              <strong>Acciones sugeridas:</strong>
              <ul>
                {selectedProductAvailability.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}
              </ul>
            </div>
          )}

          <div className="module-toolbar">
            <a className="button secondary" href={`/batches?product=${selectedProductAvailability.product._id}`}>Ver lotes del producto</a>
            <a className="button secondary" href="/data-cleanup">Ir a Limpieza de datos</a>
            <a className="button ghost" href="/reconciliation">Ver conciliación</a>
          </div>
        </div>
      )}
      {selectedProductExpiringBatches.length > 0 && <div className="notice warning">Este producto tiene {selectedProductExpiringBatches.length} lote(s) proximos a vencer. FEFO los priorizara en la venta.</div>}

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      {validationSummary && (
        <div className="notice info">
          Validacion: {validationSummary.itemsCount} item(s), total {money.format(validationSummary.total)}, costo estimado {money.format(validationSummary.estimatedCost)}, utilidad estimada {money.format(validationSummary.estimatedGrossProfit)}.
        </div>
      )}

      {showForm && orderItems.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th>SKU</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th><th>Utilidad est.</th><th></th></tr></thead>
            <tbody>
              {orderItems.map((item) => (
                <tr key={item.product}>
                  <td>{item.name}</td>
                  <td>{item.sku}</td>
                  <td>{item.quantity}</td>
                  <td>{money.format(item.salePrice)}</td>
                  <td>{money.format(item.quantity * item.salePrice)}</td>
                  <td>{money.format(item.quantity * (item.salePrice - item.unitCost))}</td>
                  <td><button className="button danger" type="button" onClick={() => removeItem(item.product)}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lastSale?.items?.some((item) => item.batches?.length > 0) && (
        <div className="table-wrap">
          <table>
            <thead><tr><th colSpan="4">Lotes usados en la ultima venta</th></tr><tr><th>Producto</th><th>Lote</th><th>Cantidad</th><th>Vencimiento</th></tr></thead>
            <tbody>
              {lastSale.items.flatMap((item) => (item.batches || []).map((batch) => (
                <tr key={`${item.product?._id || item.product}-${batch.batchNumber}`}>
                  <td>{item.product?.name}</td>
                  <td>{batch.batchNumber}</td>
                  <td>{batch.quantity}</td>
                  <td>{new Date(batch.expirationDate).toLocaleDateString('es-CO')}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}

      <div className="module-toolbar">
        <select id="sale-filter-customer" name="filterCustomer" value={saleFilters.customer} onChange={(e) => updateSaleFilter('customer', e.target.value)}>
          <option value="">Todos los clientes</option>
          {customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}</option>)}
        </select>
        <select id="sale-filter-status" name="filterStatus" value={saleFilters.status} onChange={(e) => updateSaleFilter('status', e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="activa">Activas</option>
          <option value="anulada">Anuladas</option>
        </select>
        <select id="sale-filter-payment-method" name="filterPaymentMethod" value={saleFilters.paymentMethod} onChange={(e) => updateSaleFilter('paymentMethod', e.target.value)}>
          <option value="">Todos los metodos</option>
          <option value="contado">Contado</option>
          <option value="credito">Credito</option>
        </select>
        <select id="sale-filter-payment-status" name="filterPaymentStatus" value={saleFilters.paymentStatus} onChange={(e) => updateSaleFilter('paymentStatus', e.target.value)}>
          <option value="">Todos los pagos</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagado">Pagado</option>
        </select>
        <input id="sale-filter-from" name="filterFrom" type="date" value={saleFilters.from} onChange={(e) => updateSaleFilter('from', e.target.value)} />
        <input id="sale-filter-to" name="filterTo" type="date" value={saleFilters.to} onChange={(e) => updateSaleFilter('to', e.target.value)} />
        <button className="button primary" type="button" onClick={loadData}>Consultar</button>
      </div>

      {selectedSale && (
        <div className="detail-panel">
          <h3>Detalle venta</h3>
          <p>{selectedSale.customer?.name} - {money.format(selectedSale.total)} - {selectedSale.paymentMethod} / {selectedSale.paymentStatus}</p>
          <ul>
            {selectedSale.items?.flatMap((item) => (item.batches?.length ? item.batches.map((batch) => (
              <li key={`${selectedSale._id}-${item.product?._id || item.product}-${batch.batchNumber}`}>{item.product?.name}: {batch.quantity} und, lote {batch.batchNumber}, vencimiento {formatDate(batch.expirationDate)}</li>
            )) : [<li key={`${selectedSale._id}-${item.product?._id || item.product}`}>{item.product?.name}: {item.quantity} und, sin lote asociado en respuesta</li>]))}
          </ul>
          <button className="button ghost" type="button" onClick={() => setSelectedSale(null)}>Cerrar detalle</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Cliente</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Costo</th><th>Utilidad bruta</th><th>Forma pago</th><th>Estado pago</th><th>Estado venta</th><th>Accion</th></tr>
          </thead>
          <tbody>
            {filteredSales.length === 0 && <tr><td colSpan="11">No hay ventas todavía. Usa el botón Nueva venta para crear la primera.</td></tr>}
            {filteredSales.map((sale) => (
              <tr key={sale._id}>
                <td>{new Date(sale.createdAt).toLocaleDateString('es-CO')}</td>
                <td>{sale.customer?.name}</td>
                <td>{money.format(sale.total)}</td>
                <td>{money.format(sale.paidAmount || 0)}</td>
                <td>{money.format(sale.balance || 0)}</td>
                <td>{money.format(sale.totalCost)}</td>
                <td className="positive-text">{money.format(sale.grossProfit)}</td>
                <td>{sale.paymentMethod}</td>
                <td><span className={`badge ${sale.paymentStatus}`}>{sale.paymentStatus}</span></td>
                <td><span className={`badge ${sale.status || 'activa'}`}>{sale.status || 'activa'}</span></td>
                <td><button className="button secondary" type="button" onClick={() => setSelectedSale(sale)}>Ver</button>{(sale.status || 'activa') === 'activa' && <button className="button danger" type="button" onClick={() => cancelSale(sale._id)}>Anular</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
