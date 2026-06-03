import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { exportToCsv, formatDate } from '../utils/exportUtils';

const initialForm = {
  name: '',
  category: '',
  sku: '',
  stock: 0,
  minStock: 10,
  unitCost: 0,
  salePrice: 0,
  expirationDate: ''
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '', category: '', stockLow: '', from: '', to: '' });

  const loadProducts = () => api.get('/products').then(({ data }) => setProducts(data.data || data));
  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))], [products]);
  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const q = filters.q.toLowerCase();
        const matchesText = !q || product.name.toLowerCase().includes(q) || product.sku.toLowerCase().includes(q);
        const matchesStatus = !filters.status || product.status === filters.status;
        const matchesCategory = !filters.category || product.category === filters.category;
        const matchesStockLow = filters.stockLow !== 'true' || Number(product.stock || 0) <= Number(product.minStock || 0);
        const createdAt = product.createdAt ? new Date(product.createdAt) : null;
        const from = filters.from ? new Date(filters.from) : null;
        const to = filters.to ? new Date(filters.to) : null;
        if (to) to.setHours(23, 59, 59, 999);
        const matchesFrom = !from || (createdAt && createdAt >= from);
        const matchesTo = !to || (createdAt && createdAt <= to);
        return matchesText && matchesStatus && matchesCategory && matchesStockLow && matchesFrom && matchesTo;
      }),
    [products, filters]
  );

  useEffect(() => {
    loadProducts().catch((err) => setError(err.response?.data?.message || 'Error cargando productos.'));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/products/${editingId}`, form);
      } else {
        await api.post('/products', form);
      }
      setForm(initialForm);
      setEditingId(null);
      setShowForm(false);
      await loadProducts();
    } catch (err) {
      setError(err.response?.data?.message || 'Error creando producto.');
    }
  };

  const editProduct = (product) => {
    setEditingId(product._id);
    setShowForm(true);
    setForm({
      name: product.name || '',
      category: product.category || '',
      sku: product.sku || '',
      stock: Number(product.stock || 0),
      minStock: Number(product.minStock || 0),
      unitCost: Number(product.unitCost || 0),
      salePrice: Number(product.salePrice || 0),
      expirationDate: product.expirationDate ? new Date(product.expirationDate).toISOString().slice(0, 10) : ''
    });
  };

  const startNewProduct = () => {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(true);
    setError('');
  };

  const cancelForm = () => {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(false);
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Eliminar producto "${product.name}" solo es permitido si no tiene ventas, compras, lotes ni kardex. Continuar?`)) return;
    try {
      await api.delete(`/products/${product._id}`);
      await loadProducts();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || err.response?.data?.error || 'Error eliminando producto.');
    }
  };

  const exportProducts = () => {
    const ok = exportToCsv('productos-filtrados.csv', filteredProducts.map((product) => ({
      Producto: product.name,
      SKU: product.sku,
      Categoria: product.category,
      Stock: product.stock,
      'Stock minimo': product.minStock,
      Costo: product.unitCost,
      Precio: product.salePrice,
      Vencimiento: formatDate(product.expirationDate),
      Estado: product.status
    })));
    if (!ok) setError('No hay productos para exportar.');
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Productos</h2>
        <p>Inventario, costos, precios y niveles minimos.</p>
      </div>
      <div className="module-toolbar">
        <button className="button primary" type="button" onClick={startNewProduct}>Nuevo producto</button>
        <input placeholder="Buscar por nombre o SKU" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="disponible">Disponible</option>
          <option value="bajo_stock">Bajo stock</option>
          <option value="agotado">Agotado</option>
          <option value="proximo_vencer">Proximo a vencer</option>
        </select>
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
          <option value="">Todas las categorias</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={filters.stockLow} onChange={(e) => setFilters({ ...filters, stockLow: e.target.value })}>
          <option value="">Todo el stock</option>
          <option value="true">Stock bajo</option>
        </select>
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <button className="button secondary" type="button" onClick={exportProducts}>Exportar</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir</button>
      </div>
      {showForm && <form className="form-grid" onSubmit={handleSubmit}>
        <div className="section-heading wide"><h3>{editingId ? 'Editando producto' : 'Nuevo producto'}</h3><span>Inventario principal</span></div>
        {['name', 'category', 'sku'].map((field) => (
          <label key={field}>
            {field === 'name' ? 'Nombre' : field === 'category' ? 'Categoria' : 'SKU'}
            <input value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} required />
          </label>
        ))}
        <label>
          Stock
          <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
        </label>
        <label>
          Stock minimo
          <input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })} />
        </label>
        <label>
          Costo unitario
          <input type="number" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: Number(e.target.value) })} required />
        </label>
        <label>
          Precio venta
          <input type="number" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })} required />
        </label>
        <label>
          Vencimiento
          <input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} />
        </label>
        <button className="button primary" type="submit">{editingId ? 'Guardar cambios' : 'Crear producto'}</button>
        <button className="button ghost" type="button" onClick={cancelForm}>Cancelar</button>
      </form>}
      {error && <p className="error">{error}</p>}
      {selectedProduct && (
        <div className="detail-panel">
          <h3>Detalle producto</h3>
          <p>{selectedProduct.name} - {selectedProduct.sku} - {selectedProduct.status}</p>
          <p>Stock {selectedProduct.stock}, costo ${Number(selectedProduct.unitCost).toLocaleString('es-CO')}, precio ${Number(selectedProduct.salePrice).toLocaleString('es-CO')}</p>
          <button className="button ghost" type="button" onClick={() => setSelectedProduct(null)}>Cerrar detalle</button>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th>Categoria</th>
              <th>Stock</th>
              <th>Stock minimo</th>
              <th>Costo</th>
              <th>Precio</th>
              <th>Margen</th>
              <th>Vencimiento</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 && <tr><td colSpan="11">No hay productos todavía. Usa el botón Nuevo producto para crear el primero.</td></tr>}
            {filteredProducts.map((product) => (
              <tr key={product._id} className={`row-${product.status}`}>
                <td>{product.name}</td>
                <td>{product.sku}</td>
                <td>{product.category}</td>
                <td>{product.stock}</td>
                <td>{product.minStock}</td>
                <td>${Number(product.unitCost).toLocaleString('es-CO')}</td>
                <td>${Number(product.salePrice).toLocaleString('es-CO')}</td>
                <td>{Number(product.unitCost) > 0 ? `${(((Number(product.salePrice) - Number(product.unitCost)) / Number(product.unitCost)) * 100).toFixed(1)}%` : '0%'}</td>
                <td>{product.expirationDate ? new Date(product.expirationDate).toLocaleDateString('es-CO') : '-'}</td>
                <td><span className={`badge ${product.status}`}>{product.status}</span></td>
                <td><button className="button secondary" type="button" onClick={() => setSelectedProduct(product)}>Ver</button><button className="button secondary" type="button" onClick={() => editProduct(product)}>Editar</button><button className="button danger" type="button" onClick={() => deleteProduct(product)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
