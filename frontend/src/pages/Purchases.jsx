import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { exportToCsv, formatDate } from '../utils/exportUtils';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const todayInput = () => new Date().toISOString().slice(0, 10);
const emptyPurchaseForm = () => ({ supplier: '', product: '', quantity: 1, unitCost: '', batchNumber: '', expirationDate: '', paymentMethod: 'contado', invoiceNumber: '', purchaseDate: todayInput(), note: '' });

export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyPurchaseForm());
  const [productSearch, setProductSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ supplier: '', status: '', paymentStatus: '', from: '', to: '' });
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const selectedProduct = useMemo(() => products.find((product) => product._id === form.product), [products, form.product]);
  const selectedSupplier = useMemo(() => suppliers.find((supplier) => supplier._id === form.supplier), [suppliers, form.supplier]);
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.status !== 'bloqueado'), [suppliers]);
  const activeProducts = useMemo(() => products.filter((product) => product.status !== 'inactivo'), [products]);
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return activeProducts;
    return activeProducts.filter((product) => (
      product.name?.toLowerCase().includes(term) ||
      product.sku?.toLowerCase().includes(term) ||
      product.category?.toLowerCase().includes(term)
    ));
  }, [activeProducts, productSearch]);

  const load = async () => {
    const params = new URLSearchParams({ limit: '100' });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const [purchasesRes, suppliersRes, productsRes] = await Promise.all([api.get(`/purchases?${params.toString()}`), api.get('/suppliers?limit=100'), api.get('/products?limit=100')]);
    setPurchases(purchasesRes.data.data || purchasesRes.data);
    setSuppliers(suppliersRes.data.data || suppliersRes.data);
    setProducts(productsRes.data.data || productsRes.data);
  };
  useEffect(() => { load().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando compras.')); }, []);

  const backendMessage = (err, fallback) => (
    err.response?.data?.message ||
    err.response?.data?.error ||
    err.userMessage ||
    fallback
  );

  const buildPurchasePayload = () => ({
    supplier: form.supplier,
    paymentMethod: form.paymentMethod,
    invoiceNumber: form.invoiceNumber?.trim(),
    purchaseDate: form.purchaseDate,
    note: form.note?.trim(),
    items: items.map((item) => ({
      product: item.product,
      quantity: Number(item.quantity),
      unitCost: Number(item.unitCost),
      batchNumber: item.batchNumber?.trim(),
      expirationDate: item.expirationDate
    }))
  });

  const logPurchasePayload = (payload) => {
    if (import.meta.env.DEV) console.log('Payload compra:', payload);
  };

  const validatePurchaseForm = () => {
    if (!form.supplier) return 'Seleccione un proveedor.';
    if (!form.invoiceNumber?.trim()) return 'Ingrese numero de factura.';
    if (!form.paymentMethod) return 'Seleccione forma de pago.';
    if (!['contado', 'credito'].includes(form.paymentMethod)) return 'La forma de pago no es valida.';
    if (items.length === 0) return 'Agregue al menos un producto.';

    for (const item of items) {
      if (!item.product) return 'Seleccione un producto valido.';
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) return 'La cantidad debe ser mayor que cero.';
      if (!Number.isFinite(Number(item.unitCost)) || Number(item.unitCost) <= 0) return 'El costo unitario debe ser mayor que cero.';
      if (!item.expirationDate) return 'La fecha de vencimiento del lote es obligatoria.';
    }
    return '';
  };

  const validatePurchase = async () => {
    setError('');
    setMessage('');
    const localError = validatePurchaseForm();
    if (localError) {
      setError(localError);
      return false;
    }
    try {
      const payload = buildPurchasePayload();
      logPurchasePayload(payload);
      const { data } = await api.post('/purchases/validate', payload);
      setMessage(data.message || 'La compra es valida y puede registrarse.');
      return true;
    } catch (err) {
      setError(backendMessage(err, 'No se pudo validar la compra.'));
      return false;
    }
  };

  const addItem = () => {
    if (!selectedProduct) {
      setError('Seleccione un producto valido.');
      return;
    }
    const quantity = Number(form.quantity);
    const unitCost = Number(form.unitCost);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('La cantidad debe ser mayor que cero.');
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      setError('El costo unitario debe ser mayor que cero.');
      return;
    }
    if (!form.expirationDate) {
      setError('La fecha de vencimiento del lote es obligatoria.');
      return;
    }
    const normalizedBatch = String(form.batchNumber || '').trim().toLowerCase();
    const duplicate = items.find((item) => item.product === selectedProduct._id && String(item.batchNumber || '').trim().toLowerCase() === normalizedBatch);
    if (duplicate && !window.confirm('Este producto y lote ya fueron agregados a la compra. Deseas agregar otra linea de todas formas?')) return;
    setError('');
    setMessage('');
    setItems((current) => [...current, { product: selectedProduct._id, name: selectedProduct.name, sku: selectedProduct.sku, quantity, unitCost, batchNumber: form.batchNumber, expirationDate: form.expirationDate }]);
    setForm({ ...form, product: '', quantity: 1, unitCost: '', batchNumber: '', expirationDate: '' });
    setProductSearch('');
  };

  const updateItem = (index, field, value) => {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const numericFields = ['quantity', 'unitCost'];
      return { ...item, [field]: numericFields.includes(field) ? Number(value) : value };
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const isValid = await validatePurchase();
      if (!isValid) return;
      const payload = buildPurchasePayload();
      logPurchasePayload(payload);
      await api.post('/purchases', payload);
      setItems([]);
      setForm(emptyPurchaseForm());
      setProductSearch('');
      setShowForm(false);
      setMessage('Compra registrada correctamente.');
      await load();
    } catch (err) {
      setError(backendMessage(err, 'No se pudo registrar la compra.'));
    }
  };

  const cancelPurchase = async (id) => {
    if (!window.confirm('Anular una compra reversa inventario, lotes y saldo pendiente si aplica. Continua solo si ya verificaste que es seguro.')) return;
    try {
      await api.patch(`/purchases/${id}/cancel`);
      await load();
    } catch (err) {
      setError(backendMessage(err, 'Error anulando compra.'));
    }
  };

  const exportPurchases = () => {
    const ok = exportToCsv('compras-filtradas.csv', purchases.map((purchase) => ({
      Fecha: formatDate(purchase.createdAt),
      'Fecha compra': formatDate(purchase.purchaseDate || purchase.createdAt),
      Proveedor: purchase.supplier?.name || '',
      Factura: purchase.invoiceNumber || '',
      Total: purchase.total,
      Pagado: purchase.paidAmount || 0,
      Saldo: purchase.balance || 0,
      'Forma pago': purchase.paymentMethod,
      'Estado pago': purchase.paymentStatus,
      Estado: purchase.status,
      Nota: purchase.note || ''
    })));
    if (!ok) setError('No hay compras para exportar.');
  };

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const startNewPurchase = () => {
    setItems([]);
    setForm(emptyPurchaseForm());
    setProductSearch('');
    setError('');
    setMessage('');
    setShowForm(true);
  };

  const cancelNewPurchase = () => {
    setItems([]);
    setForm(emptyPurchaseForm());
    setProductSearch('');
    setError('');
    setMessage('');
    setShowForm(false);
  };

  return (
    <div className="page-stack">
      <div className="page-title"><h2>Compras</h2><p>Registro de mercancia recibida de proveedores.</p></div>
      <div className="module-toolbar">
        <button className="button primary" type="button" onClick={startNewPurchase}>Nueva compra</button>
        <button className="button secondary" type="button" onClick={exportPurchases}>Exportar</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>
      <div className="module-toolbar">
        <select id="purchase-filter-supplier" name="filterSupplier" value={filters.supplier} onChange={(e) => updateFilter('supplier', e.target.value)}>
          <option value="">Todos los proveedores</option>
          {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
        </select>
        <select id="purchase-filter-status" name="filterStatus" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="activa">Activas</option>
          <option value="anulada">Anuladas</option>
        </select>
        <select id="purchase-filter-payment-status" name="filterPaymentStatus" value={filters.paymentStatus} onChange={(e) => updateFilter('paymentStatus', e.target.value)}>
          <option value="">Todos los pagos</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagado">Pagado</option>
        </select>
        <input id="purchase-filter-from" name="filterFrom" type="date" value={filters.from} onChange={(e) => updateFilter('from', e.target.value)} />
        <input id="purchase-filter-to" name="filterTo" type="date" value={filters.to} onChange={(e) => updateFilter('to', e.target.value)} />
        <button className="button primary" type="button" onClick={load}>Consultar</button>
      </div>
      {showForm && <form className="form-grid" onSubmit={submit}>
        <div className="section-heading wide"><h3>Datos de la compra</h3><span>Para que un producto pueda venderse, primero debe registrarse una compra con lote y vencimiento.</span></div>
        {activeSuppliers.length === 0 && <p className="empty-state wide">No hay proveedores registrados. Cree un proveedor antes de registrar una compra.</p>}
        {activeProducts.length === 0 && <p className="empty-state wide">No hay productos registrados. Cree un producto antes de registrar una compra.</p>}
        <label htmlFor="purchase-supplier">Proveedor<select id="purchase-supplier" name="supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required><option value="">Seleccionar</option>{activeSuppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}</select></label>
        <label htmlFor="purchase-invoice-number">Factura<input id="purchase-invoice-number" name="invoiceNumber" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} /></label>
        <label htmlFor="purchase-payment-method">Forma de pago<select id="purchase-payment-method" name="paymentMethod" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}><option value="">Seleccionar</option><option value="contado">Contado</option><option value="credito">Credito</option></select></label>
        <label htmlFor="purchase-date">Fecha<input id="purchase-date" name="purchaseDate" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></label>
        <label className="wide" htmlFor="purchase-note">Nota<textarea id="purchase-note" name="note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <div className="module-toolbar wide">
          <a className="button ghost" href="/suppliers">Nuevo proveedor</a>
          <a className="button ghost" href="/products">Nuevo producto</a>
          <a className="button ghost" href="/batches">Ver lotes</a>
        </div>
        {selectedSupplier && <div className="notice info wide">Proveedor seleccionado: {selectedSupplier.name}. Deuda actual: {money.format(selectedSupplier.currentDebt || 0)}.</div>}

        <div className="section-heading wide"><h3>Agregar productos</h3><span>Cada producto comprado debe tener fecha de vencimiento para controlar FEFO.</span></div>
        <label htmlFor="purchase-product-search">Buscar producto<input id="purchase-product-search" name="productSearch" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Nombre, SKU o categoria" /></label>
        <label htmlFor="purchase-product">Producto<select id="purchase-product" name="product" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}><option value="">Seleccionar</option>{filteredProducts.map((product) => <option key={product._id} value={product._id}>{product.name} - costo actual {money.format(product.unitCost)}</option>)}</select></label>
        <label htmlFor="purchase-quantity">Cantidad<input id="purchase-quantity" name="quantity" type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></label>
        <label htmlFor="purchase-unit-cost">Costo compra<input id="purchase-unit-cost" name="unitCost" type="number" min="1" step="1" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: Number(e.target.value) })} /></label>
        <label htmlFor="purchase-batch-number">Lote opcional<input id="purchase-batch-number" name="batchNumber" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} placeholder="Se genera automatico si queda vacio" /></label>
        <label htmlFor="purchase-expiration-date">Vencimiento lote<input id="purchase-expiration-date" name="expirationDate" type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} required /></label>
        {selectedProduct && <div className="notice info wide">Producto seleccionado: {selectedProduct.name} ({selectedProduct.sku}). Stock actual: {selectedProduct.stock}. Costo actual: {money.format(selectedProduct.unitCost)}.</div>}
        <button className="button secondary" type="button" onClick={addItem}>Agregar producto</button>

        <div className="section-heading wide"><h3>Productos agregados</h3><span>Revise cantidades, costos, lotes y vencimientos antes de validar.</span></div>
        {items.length === 0 && <p className="empty-state wide">Agregue al menos un producto.</p>}
        {items.length > 0 && <div className="table-wrap wide"><table><thead><tr><th>Producto</th><th>SKU</th><th>Cantidad</th><th>Costo unitario</th><th>Subtotal</th><th>Lote</th><th>Vencimiento</th><th></th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.product}-${index}`}><td>{item.name}</td><td>{item.sku || '-'}</td><td><input id={`purchase-item-${index}-quantity`} name={`items[${index}].quantity`} type="number" min="1" step="1" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} /></td><td><input id={`purchase-item-${index}-unit-cost`} name={`items[${index}].unitCost`} type="number" min="1" step="1" value={item.unitCost} onChange={(e) => updateItem(index, 'unitCost', e.target.value)} /></td><td>{money.format(Number(item.quantity || 0) * Number(item.unitCost || 0))}</td><td><input id={`purchase-item-${index}-batch-number`} name={`items[${index}].batchNumber`} value={item.batchNumber || ''} onChange={(e) => updateItem(index, 'batchNumber', e.target.value)} placeholder="Automatico" /></td><td><input id={`purchase-item-${index}-expiration-date`} name={`items[${index}].expirationDate`} type="date" value={item.expirationDate || ''} onChange={(e) => updateItem(index, 'expirationDate', e.target.value)} /></td><td><button className="button danger" type="button" onClick={() => setItems(items.filter((_, i) => i !== index))}>Quitar</button></td></tr>)}</tbody></table></div>}

        <div className="section-heading wide"><h3>Resumen</h3><span>Valide antes de registrar para confirmar datos obligatorios.</span></div>
        <div className="inline-total">Total productos: {items.length}</div>
        <div className="inline-total">Total unidades: {totalUnits}</div>
        <div className="inline-total">Total compra: {money.format(total)}</div>
        <div className="inline-total">Forma de pago: {form.paymentMethod || '-'}</div>
        <div className="module-toolbar wide">
          <button className="button secondary" type="button" onClick={validatePurchase} disabled={items.length === 0}>Validar compra</button>
          <button className="button primary" type="submit" disabled={items.length === 0}>Registrar compra</button>
          <button className="button ghost" type="button" onClick={cancelNewPurchase}>Cancelar</button>
        </div>
      </form>}
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      {selectedPurchase && (
        <div className="detail-panel">
          <h3>Detalle compra</h3>
          <p>{selectedPurchase.supplier?.name} - {money.format(selectedPurchase.total)} - {selectedPurchase.paymentMethod} / {selectedPurchase.paymentStatus}</p>
          <ul>{selectedPurchase.items?.map((item) => <li key={`${selectedPurchase._id}-${item.product?._id || item.product}-${item.batchNumber}`}>{item.product?.name}: {item.quantity} und, lote {item.batchNumber || '-'}, vencimiento {formatDate(item.expirationDate)}</li>)}</ul>
          <button className="button ghost" type="button" onClick={() => setSelectedPurchase(null)}>Cerrar detalle</button>
        </div>
      )}
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Pago</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{purchases.length === 0 && <tr><td colSpan="8">No hay compras todavía. Usa el botón Nueva compra para crear la primera.</td></tr>}{purchases.map((purchase) => <tr key={purchase._id}><td>{new Date(purchase.createdAt).toLocaleDateString('es-CO')}</td><td>{purchase.supplier?.name}</td><td>{money.format(purchase.total)}</td><td>{money.format(purchase.paidAmount || 0)}</td><td>{money.format(purchase.balance || 0)}</td><td>{purchase.paymentMethod} / {purchase.paymentStatus}</td><td><span className={`badge ${purchase.status}`}>{purchase.status}</span></td><td><button className="button secondary" type="button" onClick={() => setSelectedPurchase(purchase)}>Ver</button>{purchase.status === 'activa' && <button className="button danger" type="button" onClick={() => cancelPurchase(purchase._id)}>Anular</button>}</td></tr>)}</tbody></table></div>
    </div>
  );
}
