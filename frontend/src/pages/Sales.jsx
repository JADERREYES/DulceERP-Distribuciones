import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [expiringBatches, setExpiringBatches] = useState([]);
  const [form, setForm] = useState({ customer: '', product: '', quantity: 1, paymentMethod: 'contado', routeZone: '' });
  const [orderItems, setOrderItems] = useState([]);
  const [lastSale, setLastSale] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationSummary, setValidationSummary] = useState(null);
  const [saleFilters, setSaleFilters] = useState({ status: '', paymentMethod: '' });

  const selectedProduct = useMemo(() => products.find((product) => product._id === form.product), [products, form.product]);
  const selectedProductExpiringBatches = useMemo(() => expiringBatches.filter((batch) => batch.product?._id === form.product), [expiringBatches, form.product]);
  const selectedCustomer = useMemo(() => customers.find((customer) => customer._id === form.customer), [customers, form.customer]);
  const total = orderItems.reduce((sum, item) => sum + item.quantity * item.salePrice, 0);
  const estimatedProfit = orderItems.reduce((sum, item) => sum + item.quantity * (item.salePrice - item.unitCost), 0);
  const filteredSales = sales.filter((sale) => {
    const matchesStatus = !saleFilters.status || (sale.status || 'activa') === saleFilters.status;
    const matchesPayment = !saleFilters.paymentMethod || sale.paymentMethod === saleFilters.paymentMethod;
    return matchesStatus && matchesPayment;
  });

  const loadData = async () => {
    const [salesRes, productsRes, customersRes, batchesRes] = await Promise.all([
      api.get('/sales'),
      api.get('/products'),
      api.get('/customers'),
      api.get('/batches/expiring')
    ]);

    setSales(salesRes.data.data || salesRes.data);
    setProducts(productsRes.data.data || productsRes.data);
    setCustomers(customersRes.data.data || customersRes.data);
    setExpiringBatches(batchesRes.data.data || batchesRes.data);
  };

  useEffect(() => {
    loadData().catch((err) => setError(err.response?.data?.message || 'Error cargando ventas.'));
  }, []);

  const addProduct = () => {
    setError('');
    if (!selectedProduct) {
      setError('Selecciona un producto.');
      return;
    }

    const quantity = Number(form.quantity);
    if (!quantity || quantity < 1) {
      setError('La cantidad debe ser mayor a 0.');
      return;
    }

    const existing = orderItems.find((item) => item.product === selectedProduct._id);
    const requestedQuantity = quantity + Number(existing?.quantity || 0);

    if (requestedQuantity > selectedProduct.stock) {
      setError(`Stock insuficiente para ${selectedProduct.name}. Disponible: ${selectedProduct.stock}`);
      return;
    }

    if (existing) {
      setOrderItems((items) =>
        items.map((item) =>
          item.product === selectedProduct._id ? { ...item, quantity: item.quantity + quantity } : item
        )
      );
    } else {
      setOrderItems((items) => [
        ...items,
        {
          product: selectedProduct._id,
          name: selectedProduct.name,
          sku: selectedProduct.sku,
          quantity,
          salePrice: Number(selectedProduct.salePrice),
          unitCost: Number(selectedProduct.unitCost),
          stock: Number(selectedProduct.stock)
        }
      ]);
    }

    setForm((current) => ({ ...current, product: '', quantity: 1 }));
  };

  const removeItem = (productId) => {
    setOrderItems((items) => items.filter((item) => item.product !== productId));
  };

  const buildSalePayload = () => ({
    customer: form.customer,
    paymentMethod: form.paymentMethod,
    routeZone: form.routeZone,
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
    if (orderItems.length === 0) {
      return 'Agregue al menos un producto a la venta.';
    }
    if (!form.paymentMethod) return 'Seleccione una forma de pago.';
    if (!form.routeZone || !String(form.routeZone).trim()) return 'Seleccione zona o ruta.';

    for (const item of orderItems) {
      if (!item.product) return 'Seleccione un producto valido.';
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) return 'La cantidad debe ser mayor que cero.';
      if (!Number.isFinite(Number(item.salePrice)) || Number(item.salePrice) <= 0) return 'El precio de venta debe ser mayor que cero.';
      if (Number(item.stock) <= 0) return 'El producto no tiene stock disponible.';
      if (Number(item.quantity) > Number(item.stock)) return `Stock insuficiente para ${item.name}. Disponible: ${item.stock}`;
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
      setError(backendMessage(err, 'No se pudo validar la venta.'));
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
      setForm({ customer: '', product: '', quantity: 1, paymentMethod: 'contado', routeZone: '' });
      setOrderItems([]);
      setValidationSummary(null);
      setSuccess('Venta registrada correctamente. Lotes asignados por FEFO.');
      await loadData();
    } catch (err) {
      if (import.meta.env.DEV && err.response?.data?.details) console.log('Detalles error venta', err.response.data.details);
      setError(backendMessage(err, 'No se pudo registrar la venta.'));
    }
  };

  const cancelSale = async (saleId) => {
    setError('');
    setSuccess('');

    try {
      await api.patch(`/sales/${saleId}/cancel`);
      setSuccess('Venta anulada correctamente.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Error anulando venta.');
    }
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Ventas</h2>
        <p>Pedidos multiproducto con inventario, costo de venta, utilidad y cartera.</p>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>Cliente<select value={form.customer} onChange={(e) => {
          const customer = customers.find((item) => item._id === e.target.value);
          setForm({ ...form, customer: e.target.value, routeZone: customer?.zone || form.routeZone });
        }} required>
          <option value="">Seleccionar</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name} - {customer.status}</option>)}
        </select></label>
        <label>Forma de pago<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
          <option value="">Seleccionar</option><option value="contado">Contado</option><option value="credito">Credito</option>
        </select></label>
        <label>Zona/ruta<input value={form.routeZone} onChange={(e) => setForm({ ...form, routeZone: e.target.value })} required /></label>
        <label>Producto<select value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}>
          <option value="">Seleccionar</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} - Stock {product.stock}</option>)}
        </select></label>
        <label>Cantidad<input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
        <button className="button secondary" type="button" onClick={addProduct} disabled={selectedProduct && Number(form.quantity) > Number(selectedProduct.stock)}>Agregar producto</button>
        <div className="inline-total">Total pedido: {money.format(total)}</div>
        <div className="inline-total">Utilidad estimada: {money.format(estimatedProfit)}</div>
        <button className="button secondary" type="button" onClick={validateSaleWithBackend}>Validar venta</button>
        <button className="button primary" type="submit">Guardar venta</button>
      </form>
      {selectedCustomer && <div className="notice info">Zona sugerida: {selectedCustomer.zone}. Cupo disponible: {money.format(Number(selectedCustomer.creditLimit) - Number(selectedCustomer.currentDebt))}</div>}
      {selectedProduct && <div className={`notice ${selectedProduct.status === 'agotado' ? 'danger' : selectedProduct.status === 'bajo_stock' || selectedProduct.status === 'proximo_vencer' ? 'warning' : 'info'}`}>Stock disponible: {selectedProduct.stock}. Estado: {selectedProduct.status}</div>}
      {selectedProductExpiringBatches.length > 0 && <div className="notice warning">Este producto tiene {selectedProductExpiringBatches.length} lote(s) proximos a vencer. FEFO los priorizara en la venta.</div>}

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      {validationSummary && (
        <div className="notice info">
          Validacion: {validationSummary.itemsCount} item(s), total {money.format(validationSummary.total)}, costo estimado {money.format(validationSummary.estimatedCost)}, utilidad estimada {money.format(validationSummary.estimatedGrossProfit)}.
        </div>
      )}

      {orderItems.length > 0 && (
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
        <select value={saleFilters.status} onChange={(e) => setSaleFilters({ ...saleFilters, status: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="activa">Activas</option>
          <option value="anulada">Anuladas</option>
        </select>
        <select value={saleFilters.paymentMethod} onChange={(e) => setSaleFilters({ ...saleFilters, paymentMethod: e.target.value })}>
          <option value="">Todos los metodos</option>
          <option value="contado">Contado</option>
          <option value="credito">Credito</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Cliente</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Costo</th><th>Utilidad bruta</th><th>Forma pago</th><th>Estado pago</th><th>Estado venta</th><th>Accion</th></tr>
          </thead>
          <tbody>
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
                <td>{(sale.status || 'activa') === 'activa' && <button className="button danger" onClick={() => cancelSale(sale._id)}>Anular</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
