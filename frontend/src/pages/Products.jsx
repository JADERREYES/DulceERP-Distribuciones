import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

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
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '', category: '' });

  const loadProducts = () => api.get('/products').then(({ data }) => setProducts(data.data || data));
  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))], [products]);
  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const q = filters.q.toLowerCase();
        const matchesText = !q || product.name.toLowerCase().includes(q) || product.sku.toLowerCase().includes(q);
        const matchesStatus = !filters.status || product.status === filters.status;
        const matchesCategory = !filters.category || product.category === filters.category;
        return matchesText && matchesStatus && matchesCategory;
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
      await api.post('/products', form);
      setForm(initialForm);
      await loadProducts();
    } catch (err) {
      setError(err.response?.data?.message || 'Error creando producto.');
    }
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Productos</h2>
        <p>Inventario, costos, precios y niveles minimos.</p>
      </div>
      <div className="module-toolbar">
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
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
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
        <button className="button primary" type="submit">Crear producto</button>
      </form>
      {error && <p className="error">{error}</p>}
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
            </tr>
          </thead>
          <tbody>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
