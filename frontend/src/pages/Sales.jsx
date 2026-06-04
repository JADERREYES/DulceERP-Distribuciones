import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { exportToCsv, formatDate } from '../utils/exportUtils';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Sales() {
  const { user } = useAuth();
  const [sales, setSales] = useState([]);
  const [sellableProducts, setSellableProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ customer: '', product: '', quantity: 1, unitPrice: '', paymentMethod: 'contado', routeZone: '', note: '' });
  const [orderItems, setOrderItems] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saleFilters, setSaleFilters] = useState({ customer: '', status: '', paymentMethod: '', paymentStatus: '', from: '', to: '' });
  const [selectedSale, setSelectedSale] = useState(null);
  const [sellableLoading, setSellableLoading] = useState(false);
  const [sellableFilters, setSellableFilters] = useState({ search: '' });
  const [unavailableProducts, setUnavailableProducts] = useState([]);
  const [allowExpiredLotSalesForTest, setAllowExpiredLotSalesForTest] = useState(false);

  const total = orderItems.reduce((sum, item) => sum + item.quantity * item.salePrice, 0);
  const totalQuantity = orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const filteredSales = sales;
  const visibleSellableProducts = useMemo(() => {
    const term = sellableFilters.search.trim().toLowerCase();
    return sellableProducts.filter((product) => {
      const hasStock = Number(product.sellableQuantity || 0) > 0;
      if (!hasStock) return false;
      if (!term) return true;
      return (
        product.name?.toLowerCase().includes(term) ||
        product.sku?.toLowerCase().includes(term) ||
        product.category?.toLowerCase().includes(term)
      );
    });
  }, [sellableProducts, sellableFilters.search]);
  const selectedProduct = useMemo(
    () => visibleSellableProducts.find((product) => product._id === form.product),
    [visibleSellableProducts, form.product]
  );
  const canCreateSale = ['admin', 'vendedor'].includes(user?.role);

  const loadData = async () => {
    const params = new URLSearchParams({ limit: '100' });
    Object.entries(saleFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const [salesRes, customersRes] = await Promise.all([
      api.get(`/sales?${params.toString()}`),
      api.get('/customers?limit=100')
    ]);

    setSales(salesRes.data.data || salesRes.data);
    setCustomers(customersRes.data.data || customersRes.data);
  };

  const loadConfig = async () => {
    const { data } = await api.get('/health');
    setAllowExpiredLotSalesForTest(Boolean(data.allowExpiredLotSalesForTest));
  };

  const loadSellableProducts = async () => {
    setSellableLoading(true);
    const params = new URLSearchParams({ page: '1', limit: '100', onlyAvailable: 'true' });
    Object.entries(sellableFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    try {
      const { data } = await api.get(`/products/sellable?${params.toString()}`);
      const availableRows = data.data || [];
      setSellableProducts(availableRows);
      setUnavailableProducts([]);

      if (availableRows.length === 0 && sellableFilters.search.trim()) {
        const diagnosticParams = new URLSearchParams({ page: '1', limit: '20', onlyAvailable: 'false', search: sellableFilters.search.trim() });
        const diagnosticRes = await api.get(`/products/sellable?${diagnosticParams.toString()}`);
        setUnavailableProducts((diagnosticRes.data.data || []).filter((product) => Number(product.sellableQuantity || 0) <= 0));
      }
    } catch (err) {
      setError(backendMessage(err, 'Error cargando productos disponibles para venta.'));
    } finally {
      setSellableLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([loadData(), loadSellableProducts(), loadConfig()]).catch((err) => setError(err.response?.data?.message || 'Error cargando ventas.'));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSellableProducts();
    }, 250);
    return () => clearTimeout(timer);
  }, [sellableFilters.search]);

  const addSellableProduct = (product, selectedQuantity) => {
    setError('');
    setSuccess('');

    const quantity = Number(selectedQuantity || 1);
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
      setError(`Solo hay ${sellableQuantity} unidades disponibles para vender.`);
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
    setSuccess(`${product.name} agregado.`);
  };

  const addSelectedProduct = () => {
    if (!selectedProduct) {
      setError('Seleccione un producto disponible.');
      return;
    }
    addSellableProduct(selectedProduct, form.quantity);
  };

  const addTestBypassProduct = (product) => {
    setError('');
    setSuccess('');

    if (!allowExpiredLotSalesForTest) {
      setError('El modo prueba de ventas sin FEFO no esta habilitado.');
      return;
    }

    const quantity = Number(form.quantity || 1);
    const generalStock = Number(product.generalStock || 0);
    if (!quantity || quantity <= 0) {
      setError('La cantidad debe ser mayor que cero.');
      return;
    }
    if (quantity > generalStock) {
      setError(`Solo hay ${generalStock} unidades de stock general para esta prueba.`);
      return;
    }

    const existing = orderItems.find((item) => item.product === product._id);
    const requestedQuantity = quantity + Number(existing?.quantity || 0);
    if (requestedQuantity > generalStock) {
      setError(`Solo hay ${generalStock} unidades de stock general para esta prueba.`);
      return;
    }

    if (existing) {
      setOrderItems((items) => items.map((item) => (
        item.product === product._id ? { ...item, quantity: item.quantity + quantity, testBypassFefo: true } : item
      )));
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
          stock: generalStock,
          maxSellableQuantity: generalStock,
          testBypassFefo: true
        }
      ]);
    }

    setSuccess(`${product.name} agregado en modo prueba sin FEFO.`);
  };

  const removeItem = (productId) => {
    setOrderItems((items) => items.filter((item) => item.product !== productId));
  };

  const buildSalePayload = () => ({
    customer: form.customer,
    paymentMethod: form.paymentMethod,
    routeZone: form.routeZone,
    note: form.note || '',
    testBypassFefo: orderItems.some((item) => item.testBypassFefo),
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
    if (orderItems.length === 0) return 'Agrega un producto disponible para guardar la venta.';

    for (const item of orderItems) {
      if (!item.product) return 'Seleccione un producto valido.';
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) return 'La cantidad debe ser mayor que cero.';
      if (!Number.isFinite(Number(item.salePrice)) || Number(item.salePrice) <= 0) return 'El precio de venta debe ser mayor que cero.';
      if (Number(item.stock) <= 0) return 'El producto no tiene stock disponible.';
      if (Number(item.quantity) > Number(item.stock)) return `Stock insuficiente para ${item.name}. Disponible: ${item.stock}`;
      if (item.maxSellableQuantity !== undefined && Number(item.quantity) > Number(item.maxSellableQuantity)) {
        return `Solo hay ${item.maxSellableQuantity} unidades disponibles para vender de ${item.name}.`;
      }
    }
    return '';
  };

  const validateSaleWithBackend = async () => {
    setError('');
    setSuccess('');

    const localError = validateBeforeSend();
    if (localError) {
      setError(localError);
      return null;
    }

    const payload = buildSalePayload();
    if (import.meta.env.DEV) console.log('Payload venta', payload);

    try {
      const validationRes = await api.post('/sales/validate', payload);
      setSuccess(validationRes.data.warning || validationRes.data.message || 'La venta es valida y puede registrarse.');
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

    const validation = await validateSaleWithBackend();
    if (!validation?.ok) return;

    try {
      const payload = buildSalePayload();
      if (import.meta.env.DEV) console.log('Payload venta', payload);
      await api.post('/sales', payload);

      setForm({ customer: '', product: '', quantity: 1, unitPrice: '', paymentMethod: 'contado', routeZone: '', note: '' });
      setOrderItems([]);
      setSuccess('Venta registrada correctamente.');
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
  const updateSellableFilter = (field, value) => {
    setUnavailableProducts([]);
    setSellableFilters((current) => ({ ...current, [field]: value }));
  };

  const startNewSale = () => {
    if (!canCreateSale) {
      setError('No tienes permisos para registrar ventas.');
      return;
    }
    setForm({ customer: '', product: '', quantity: 1, unitPrice: '', paymentMethod: 'contado', routeZone: '', note: '' });
    setOrderItems([]);
    setError('');
    setSuccess('');
    loadSellableProducts();
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Ventas</h2>
        <p>Venta rapida de productos disponibles por FEFO.</p>
      </div>

      <div className="module-toolbar">
        <button className="button primary" type="button" onClick={startNewSale}>Nueva venta</button>
        <button className="button secondary" type="button" onClick={exportSales}>Exportar</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>

      {canCreateSale && <form className="quick-form" onSubmit={handleSubmit}>
        <section className="quick-section">
          <div className="section-heading"><h3>1. Cliente</h3></div>
          <div className="quick-product-row">
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
          </div>
        </section>

        <details className="collapsible-panel">
          <summary>Opciones avanzadas</summary>
          <label htmlFor="sale-note">Nota<textarea id="sale-note" name="note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        </details>

        <section className="quick-section">
          <div className="section-heading"><h3>2. Producto</h3></div>
          <div className="quick-product-row">
            <label htmlFor="sale-product-search">Buscar producto<input id="sale-product-search" name="productSearch" value={sellableFilters.search} onChange={(e) => updateSellableFilter('search', e.target.value)} placeholder="Nombre, SKU o categoria" /></label>
            <label htmlFor="sale-product">Producto<select id="sale-product" name="product" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} disabled={visibleSellableProducts.length === 0}>
              <option value="">{visibleSellableProducts.length === 0 ? 'Sin productos disponibles' : 'Seleccionar'}</option>
              {visibleSellableProducts.map((product) => (
                <option key={product._id} value={product._id}>{product.name} - {product.sellableQuantity} disp. - {money.format(product.salePrice)}</option>
              ))}
            </select></label>
            <label htmlFor="sale-quantity">Cantidad<input id="sale-quantity" name="quantity" type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></label>
            <button className="button primary primary-action" type="button" onClick={addSelectedProduct} disabled={!selectedProduct || Number(form.quantity) <= 0 || Number(form.quantity) > Number(selectedProduct?.sellableQuantity || 0)}>Agregar</button>
          </div>
          {!selectedProduct && visibleSellableProducts.length > 0 && <p className="muted-text">Seleccione un producto disponible.</p>}
          {selectedProduct && Number(form.quantity) > Number(selectedProduct.sellableQuantity || 0) && <p className="error">Solo hay {selectedProduct.sellableQuantity} unidades disponibles para vender.</p>}
          {!sellableLoading && sellableFilters.search.trim() && visibleSellableProducts.length > 0 && (
            <div className="simple-sale-results">
              {visibleSellableProducts.slice(0, 5).map((product) => (
                <div className="simple-sale-result" key={product._id}>
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.sellableQuantity} disponibles · {money.format(product.salePrice)}</span>
                  </div>
                  <button className="button primary" type="button" onClick={() => addSellableProduct(product, form.quantity)}>Vender</button>
                </div>
              ))}
            </div>
          )}
          {sellableLoading && <p className="empty-state">Cargando productos...</p>}
          {!sellableLoading && sellableProducts.length === 0 && (
            <div className="sales-empty-state">
              <h3>No hay productos disponibles para vender.</h3>
              <p>Para vender, primero debe existir una compra con lote vigente y cantidad disponible.</p>
              <div className="module-toolbar">
                <a className="button secondary" href="/purchases">Ir a Compras</a>
                <a className="button secondary" href="/batches">Ver Lotes</a>
                <a className="button ghost" href="/data-cleanup">Limpieza de datos</a>
                <a className="button ghost" href="/reconciliation">Conciliacion</a>
              </div>
            </div>
          )}
          {!sellableLoading && unavailableProducts.length > 0 && (
            <div className="unavailable-products-card">
              <h3>Producto encontrado, pero no vendible</h3>
              {unavailableProducts.map((product) => (
                <div className="unavailable-product" key={product._id}>
                  <strong>{product.name}</strong>
                  <span>Stock general: {product.generalStock}</span>
                  <span>Disponible para vender: {product.sellableQuantity}</span>
                  <span>Vencido/no vendible: {product.expiredQuantity}</span>
                  <p>{product.name} existe, pero no tiene lotes disponibles para venta.</p>
                  <p>{product.reason || 'Sin lotes disponibles para venta.'}</p>
                  {product.warnings?.length > 0 && <p>{product.warnings[0]}</p>}
                  <p>Este producto tiene stock general, pero sus lotes estan vencidos o no disponibles. Registre una compra real con lote vigente, corrija vencimiento con razon o registre merma si esta vencido.</p>
                  {allowExpiredLotSalesForTest && (
                    <div className="notice warning">
                      Este producto no tiene lotes vigentes disponibles, pero el modo prueba esta activo. Puedes probar la venta usando stock general. Esta opcion no debe usarse en produccion.
                    </div>
                  )}
                  <div className="module-toolbar">
                    {allowExpiredLotSalesForTest && <button className="button primary" type="button" onClick={() => addTestBypassProduct(product)}>Usar modo prueba de venta</button>}
                    <a className="button secondary" href="/purchases">Ir a Compras</a>
                    <a className="button secondary" href={`/batches?product=${product._id}`}>Ver Lotes</a>
                    <a className="button ghost" href="/data-cleanup">Limpieza de datos</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="quick-section">
          <div className="section-heading"><h3>3. Guardar</h3></div>
          {orderItems.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Producto</th><th>Cant.</th><th>Subtotal</th><th></th></tr></thead>
                <tbody>
                  {orderItems.map((item) => (
                    <tr key={item.product}>
                      <td>{item.name}{item.testBypassFefo && <span className="badge warning">Modo prueba sin FEFO</span>}</td>
                      <td>{item.quantity}</td>
                      <td>{money.format(item.quantity * item.salePrice)}</td>
                      <td><button className="button danger" type="button" onClick={() => removeItem(item.product)}>Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {orderItems.length === 0 && <p className="empty-state">Agrega un producto para guardar.</p>}
          {orderItems.some((item) => item.testBypassFefo) && <div className="notice warning">Venta de prueba: no se aplico FEFO.</div>}
          <div className="quick-summary simple-sale-summary">
            <div><span>Unidades</span><strong>{totalQuantity}</strong></div>
            <div><span>Total</span><strong>{money.format(total)}</strong></div>
            {canCreateSale && <button className="button primary primary-action primary-save-button" type="submit" disabled={orderItems.length === 0}>Guardar venta</button>}
            <button className="button secondary secondary-action" type="button" onClick={() => setOrderItems([])}>Limpiar</button>
          </div>
        </section>
      </form>}
      {!canCreateSale && <p className="error">No tienes permisos para registrar ventas.</p>}
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

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

      <details className="collapsible-panel">
        <summary>Mostrar historial</summary>
        <div className="module-toolbar">
          <button className="button secondary" type="button" onClick={startNewSale}>Nueva venta</button>
          <button className="button secondary" type="button" onClick={exportSales}>Exportar</button>
          <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
        </div>
        <details className="collapsible-panel">
          <summary>Filtros del historial</summary>
          <div className="module-toolbar">
          <select id="sales-filter-customer" name="filterCustomer" value={saleFilters.customer} onChange={(e) => updateSaleFilter('customer', e.target.value)}>
            <option value="">Todos los clientes</option>
            {customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}</option>)}
          </select>
          <select id="sales-filter-status" name="filterStatus" value={saleFilters.status} onChange={(e) => updateSaleFilter('status', e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="activa">Activas</option>
            <option value="anulada">Anuladas</option>
          </select>
          <select id="sales-filter-payment-method" name="filterPaymentMethod" value={saleFilters.paymentMethod} onChange={(e) => updateSaleFilter('paymentMethod', e.target.value)}>
            <option value="">Todos los metodos</option>
            <option value="contado">Contado</option>
            <option value="credito">Credito</option>
          </select>
          <select id="sales-filter-payment-status" name="filterPaymentStatus" value={saleFilters.paymentStatus} onChange={(e) => updateSaleFilter('paymentStatus', e.target.value)}>
            <option value="">Todos los pagos</option>
            <option value="pendiente">Pendiente</option>
            <option value="pagado">Pagado</option>
          </select>
          <input id="sales-filter-from" name="filterFrom" type="date" value={saleFilters.from} onChange={(e) => updateSaleFilter('from', e.target.value)} />
          <input id="sales-filter-to" name="filterTo" type="date" value={saleFilters.to} onChange={(e) => updateSaleFilter('to', e.target.value)} />
          <button className="button primary" type="button" onClick={loadData}>Consultar</button>
          </div>
        </details>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Cliente</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Pago</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 && <tr><td colSpan="8">No hay ventas todavia.</td></tr>}
              {filteredSales.map((sale) => (
                <tr key={sale._id}>
                  <td>{new Date(sale.createdAt).toLocaleDateString('es-CO')}</td>
                  <td>{sale.customer?.name}</td>
                  <td>{money.format(sale.total)}</td>
                  <td>{money.format(sale.paidAmount || 0)}</td>
                  <td>{money.format(sale.balance || 0)}</td>
                  <td>{sale.paymentMethod} / {sale.paymentStatus}</td>
                  <td><span className={`badge ${sale.status || 'activa'}`}>{sale.status || 'activa'}</span>{sale.testMode && <span className="badge warning">Prueba sin FEFO</span>}</td>
                  <td><button className="button secondary" type="button" onClick={() => setSelectedSale(sale)}>Ver</button>{(sale.status || 'activa') === 'activa' && <button className="button danger" type="button" onClick={() => cancelSale(sale._id)}>Anular</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
