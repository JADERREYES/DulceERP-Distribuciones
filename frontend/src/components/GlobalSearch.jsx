import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }

    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/search?q=${encodeURIComponent(query.trim())}`);
        setResults(data);
        setOpen(true);
      } catch (error) {
        setResults({ products: [], customers: [], sales: [] });
      }
    }, 300);

    return () => clearTimeout(timer.current);
  }, [query]);

  const go = (path) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  return (
    <div className="global-search">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results && setOpen(true)}
        placeholder="Buscar productos, clientes o ventas"
      />
      {open && results && (
        <div className="search-results">
          <SearchGroup title="Productos" items={results.products} render={(item) => `${item.name} - ${item.sku}`} onClick={() => go('/products')} />
          <SearchGroup title="Clientes" items={results.customers} render={(item) => `${item.name} - ${item.document}`} onClick={() => go('/customers')} />
          <SearchGroup title="Ventas" items={results.sales} render={(item) => `${item.customer?.name || 'Venta'} - $${Number(item.total).toLocaleString('es-CO')}`} onClick={() => go('/sales')} />
        </div>
      )}
    </div>
  );
}

function SearchGroup({ title, items = [], render, onClick }) {
  return (
    <section>
      <strong>{title}</strong>
      {items.length === 0 && <p>Sin resultados</p>}
      {items.map((item) => (
        <button key={item._id} type="button" onMouseDown={onClick}>
          {render(item)}
        </button>
      ))}
    </section>
  );
}
