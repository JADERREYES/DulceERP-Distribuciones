import { useLocation } from 'react-router-dom';

const labels = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/products': 'Productos',
  '/customers': 'Clientes',
  '/sales': 'Ventas',
  '/payments': 'Pagos / Cartera',
  '/expenses': 'Gastos',
  '/reports': 'Reportes'
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  return (
    <nav className="breadcrumbs" aria-label="Ruta actual">
      <span>Inicio</span>
      <span>/</span>
      <strong>{labels[pathname] || 'Modulo'}</strong>
    </nav>
  );
}
