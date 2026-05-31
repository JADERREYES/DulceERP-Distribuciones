import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ supplier: '', product: '', quantity: 1, unitCost: 0, batchNumber: '', expirationDate: '', paymentMethod: 'contado', invoiceNumber: '', note: '' });
  const [error, setError] = useState('');
  const selectedProduct = useMemo(() => products.find((product) => product._id === form.product), [products, form.product]);
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

  const load = async () => {
    const [purchasesRes, suppliersRes, productsRes] = await Promise.all([api.get('/purchases'), api.get('/suppliers'), api.get('/products')]);
    setPurchases(purchasesRes.data.data || purchasesRes.data);
    setSuppliers(suppliersRes.data.data || suppliersRes.data);
    setProducts(productsRes.data.data || productsRes.data);
  };
  useEffect(() => { load().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando compras.')); }, []);

  const addItem = () => {
    if (!selectedProduct || Number(form.quantity) < 1 || Number(form.unitCost) <= 0) {
      setError('Selecciona producto, cantidad y costo validos.');
      return;
    }
    if (!form.expirationDate) {
      setError('La fecha de vencimiento del lote es obligatoria.');
      return;
    }
    setError('');
    setItems((current) => [...current, { product: selectedProduct._id, name: selectedProduct.name, quantity: Number(form.quantity), unitCost: Number(form.unitCost), batchNumber: form.batchNumber, expirationDate: form.expirationDate }]);
    setForm({ ...form, product: '', quantity: 1, unitCost: 0, batchNumber: '', expirationDate: '' });
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.post('/purchases', { supplier: form.supplier, paymentMethod: form.paymentMethod, invoiceNumber: form.invoiceNumber, note: form.note, items });
      setItems([]);
      setForm({ supplier: '', product: '', quantity: 1, unitCost: 0, batchNumber: '', expirationDate: '', paymentMethod: 'contado', invoiceNumber: '', note: '' });
      await load();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || err.response?.data?.error || 'Error registrando compra.');
    }
  };

  const cancelPurchase = async (id) => {
    try {
      await api.patch(`/purchases/${id}/cancel`);
      await load();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error anulando compra.');
    }
  };

  return (
    <div className="page-stack">
      <div className="page-title"><h2>Compras</h2><p>Entradas de inventario, costos y cuentas por pagar.</p></div>
      <form className="form-grid" onSubmit={submit}>
        <label>Proveedor<select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required><option value="">Seleccionar</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}</select></label>
        <label>Forma de pago<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}><option value="contado">Contado</option><option value="credito">Credito</option></select></label>
        <label>Factura<input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} /></label>
        <label>Producto<select value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}><option value="">Seleccionar</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} - costo actual {money.format(product.unitCost)}</option>)}</select></label>
        <label>Cantidad<input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
        <label>Costo compra<input type="number" min="1" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} /></label>
        <label>Lote opcional<input value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} placeholder="Se genera automatico si queda vacio" /></label>
        <label>Vencimiento lote<input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} required /></label>
        <button className="button secondary" type="button" onClick={addItem}>Agregar producto</button>
        <div className="inline-total">Total compra: {money.format(total)}</div>
        <button className="button primary" type="submit" disabled={items.length === 0}>Registrar compra</button>
      </form>
      {error && <p className="error">{error}</p>}
      {items.length > 0 && <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Costo</th><th>Lote</th><th>Vencimiento</th><th>Subtotal</th><th></th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.product}-${index}`}><td>{item.name}</td><td>{item.quantity}</td><td>{money.format(item.unitCost)}</td><td>{item.batchNumber || 'Automatico'}</td><td>{item.expirationDate}</td><td>{money.format(item.quantity * item.unitCost)}</td><td><button className="button danger" type="button" onClick={() => setItems(items.filter((_, i) => i !== index))}>Quitar</button></td></tr>)}</tbody></table></div>}
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Pago</th><th>Estado</th><th>Accion</th></tr></thead><tbody>{purchases.map((purchase) => <tr key={purchase._id}><td>{new Date(purchase.createdAt).toLocaleDateString('es-CO')}</td><td>{purchase.supplier?.name}</td><td>{money.format(purchase.total)}</td><td>{money.format(purchase.paidAmount || 0)}</td><td>{money.format(purchase.balance || 0)}</td><td>{purchase.paymentMethod} / {purchase.paymentStatus}</td><td><span className={`badge ${purchase.status}`}>{purchase.status}</span></td><td>{purchase.status === 'activa' && <button className="button danger" onClick={() => cancelPurchase(purchase._id)}>Anular</button>}</td></tr>)}</tbody></table></div>
    </div>
  );
}
