import { useNavigate } from 'react-router-dom';

const actions = [
  { label: 'Nueva venta', to: '/sales' },
  { label: 'Registrar pago', to: '/payments' },
  { label: 'Agregar producto', to: '/products' },
  { label: 'Nuevo cliente', to: '/customers' },
  { label: 'Ver reportes', to: '/reports' },
  { label: 'Productos criticos', to: '/reports' }
];

export default function QuickActions() {
  const navigate = useNavigate();
  return (
    <section className="quick-actions">
      {actions.map((action) => (
        <button key={action.label} className="button secondary" type="button" onClick={() => navigate(action.to)}>
          {action.label}
        </button>
      ))}
    </section>
  );
}
