import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const groups = [
  { title: 'Principal', links: [{ to: '/dashboard', label: 'Dashboard' }] },
  {
    title: 'Operacion',
    links: [
      { to: '/sales', label: 'Ventas' },
      { to: '/payments', label: 'Pagos / Cartera' },
      { to: '/customers', label: 'Clientes' }
    ]
  },
  {
    title: 'Compras',
    links: [
      { to: '/suppliers', label: 'Proveedores' },
      { to: '/purchases', label: 'Compras' },
      { to: '/supplier-payments', label: 'Pagos proveedores' }
    ]
  },
  {
    title: 'Inventario',
    links: [
      { to: '/products', label: 'Productos' },
      { to: '/batches', label: 'Lotes' },
      { to: '/wastes', label: 'Mermas' },
      { to: '/kardex', label: 'Kardex' }
    ]
  },
  {
    title: 'Finanzas',
    links: [
      { to: '/expenses', label: 'Gastos' },
      { to: '/reports', label: 'Reportes' },
      { to: '/reconciliation', label: 'Conciliacion' }
    ]
  }
];

const allowedByRoute = {
  '/dashboard': ['admin', 'contador'],
  '/sales': ['admin', 'contador', 'vendedor', 'cartera', 'repartidor'],
  '/payments': ['admin', 'contador', 'cartera'],
  '/customers': ['admin', 'contador', 'vendedor', 'cartera'],
  '/products': ['admin', 'contador', 'vendedor', 'bodega'],
  '/batches': ['admin', 'contador', 'bodega'],
  '/wastes': ['admin', 'contador', 'bodega'],
  '/suppliers': ['admin', 'contador', 'bodega'],
  '/purchases': ['admin', 'contador', 'bodega'],
  '/supplier-payments': ['admin', 'contador'],
  '/kardex': ['admin', 'contador', 'bodega'],
  '/expenses': ['admin', 'contador'],
  '/reports': ['admin', 'contador'],
  '/reconciliation': ['admin', 'contador', 'bodega'],
  '/audit-logs': ['admin', 'contador'],
  '/data-cleanup': ['admin'],
  '/users': ['admin']
};

export default function Sidebar() {
  const { user } = useAuth();
  const visibleGroups = groups
    .map((group) => {
      const links = group.links.filter((link) => allowedByRoute[link.to]?.includes(user?.role));
      return links.length > 0 ? { ...group, links } : null;
    })
    .filter(Boolean);
  if (['admin', 'contador'].includes(user?.role)) {
    const adminLinks = [{ to: '/audit-logs', label: 'Auditoria' }];
    if (user?.role === 'admin') {
      adminLinks.push({ to: '/users', label: 'Usuarios' });
      adminLinks.push({ to: '/data-cleanup', label: 'Limpieza de datos' });
    }
    visibleGroups.push({ title: 'Administracion', links: adminLinks });
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">D</span>
        <div>
          <strong>DulceERP</strong>
          <small>Distribuciones</small>
        </div>
      </div>
      <nav>
        {visibleGroups.map((group) => (
          <div className="nav-group" key={group.title}>
            <span>{group.title}</span>
            {group.links.map((link) => (
              <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                {link.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
