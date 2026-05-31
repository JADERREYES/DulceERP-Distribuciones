import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const actions = ['CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'PAYMENT', 'LOGIN', 'LOGOUT', 'STOCK_DECREASE', 'STOCK_INCREASE', 'STATUS_CHANGE'];
const modules = ['auth', 'products', 'customers', 'sales', 'payments', 'expenses', 'dashboard', 'reports'];

export default function AuditLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filters, setFilters] = useState({ module: '', action: '', search: '', page: 1 });
  const [error, setError] = useState('');

  const canView = ['admin', 'contador'].includes(user?.role);

  const loadLogs = async (nextFilters = filters) => {
    if (!canView) return;
    setError('');
    try {
      const params = new URLSearchParams();
      Object.entries(nextFilters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      params.set('limit', '15');
      const { data } = await api.get(`/audit-logs?${params.toString()}`);
      setLogs(data.data || []);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error cargando auditoria.');
    }
  };

  useEffect(() => {
    loadLogs();
  }, [canView]);

  if (!canView) {
    return <p className="error">No tienes permisos para ver la auditoría del sistema.</p>;
  }

  const updateFilters = (patch) => {
    const next = { ...filters, ...patch, page: patch.page || 1 };
    setFilters(next);
    loadLogs(next);
  };

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Auditoria del sistema</h2>
        <p>Historial de acciones criticas por usuario, modulo y entidad.</p>
      </div>

      <div className="module-toolbar">
        <input placeholder="Buscar descripcion, usuario o entidad" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select value={filters.module} onChange={(e) => updateFilters({ module: e.target.value })}>
          <option value="">Todos los modulos</option>
          {modules.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.action} onChange={(e) => updateFilters({ action: e.target.value })}>
          <option value="">Todas las acciones</option>
          {actions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button className="button secondary" type="button" onClick={() => updateFilters({ search: filters.search })}>Buscar</button>
        <button className="button primary" type="button" onClick={() => loadLogs()}>Actualizar</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Accion</th><th>Modulo</th><th>Descripcion</th></tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log._id}>
                <td>{new Date(log.createdAt).toLocaleString('es-CO')}</td>
                <td>{log.userName || log.userEmail || '-'}</td>
                <td>{log.userRole || '-'}</td>
                <td><span className="badge info">{log.action}</span></td>
                <td>{log.module}</td>
                <td>{log.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button className="button secondary" disabled={pagination.page <= 1} onClick={() => updateFilters({ page: pagination.page - 1 })}>Anterior</button>
        <span>Pagina {pagination.page} de {pagination.totalPages} ({pagination.total} registros)</span>
        <button className="button secondary" disabled={pagination.page >= pagination.totalPages} onClick={() => updateFilters({ page: pagination.page + 1 })}>Siguiente</button>
      </div>
    </div>
  );
}
