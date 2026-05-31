import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const roles = ['admin', 'contador', 'vendedor', 'bodega', 'cartera', 'repartidor'];
const statuses = ['activo', 'inactivo', 'bloqueado'];

const emptyForm = { name: '', email: '', password: '', role: 'vendedor', status: 'activo' };

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [passwordForm, setPasswordForm] = useState({ userId: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedUser = useMemo(() => users.find((item) => item._id === editingId), [users, editingId]);

  const loadUsers = async () => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.role) params.set('role', filters.role);
    if (filters.status) params.set('status', filters.status);
    const res = await api.get(`/users?${params.toString()}`);
    setUsers(res.data.data || res.data);
  };

  useEffect(() => {
    loadUsers().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando usuarios.'));
  }, []);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const submitUser = async (event) => {
    event.preventDefault();
    clearMessages();
    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, {
          name: form.name,
          email: form.email,
          role: form.role,
          status: form.status
        });
        setSuccess('Usuario actualizado correctamente.');
      } else {
        await api.post('/users', form);
        setSuccess('Usuario creado correctamente.');
      }
      setForm(emptyForm);
      setEditingId('');
      await loadUsers();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || err.response?.data?.error || 'Error guardando usuario.');
    }
  };

  const startEdit = (item) => {
    setEditingId(item._id);
    setForm({ name: item.name, email: item.email, password: '', role: item.role, status: item.status || 'activo' });
    clearMessages();
  };

  const changeStatus = async (item, status) => {
    clearMessages();
    try {
      await api.patch(`/users/${item._id}/status`, { status });
      setSuccess('Estado actualizado correctamente.');
      await loadUsers();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error cambiando estado.');
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    clearMessages();
    try {
      await api.patch(`/users/${passwordForm.userId}/password`, { password: passwordForm.password });
      setPasswordForm({ userId: '', password: '' });
      setSuccess('Contrasena actualizada correctamente.');
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error cambiando contrasena.');
    }
  };

  const deleteUser = async (item) => {
    clearMessages();
    const ok = window.confirm(`Eliminar usuario ${item.email}? Esta accion no afecta documentos contables.`);
    if (!ok) return;
    try {
      await api.delete(`/users/${item._id}`);
      setSuccess('Usuario eliminado correctamente.');
      await loadUsers();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error eliminando usuario.');
    }
  };

  if (currentUser?.role !== 'admin') {
    return <div className="notice danger">No tienes permisos para administrar usuarios.</div>;
  }

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Usuarios</h2>
        <p>Administracion segura de usuarios, roles y estados de acceso.</p>
      </div>

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      <section className="page-stack">
        <h3>{editingId ? `Editar usuario ${selectedUser?.email || ''}` : 'Crear usuario'}</h3>
        <form className="form-grid" onSubmit={submitUser}>
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          {!editingId && <label>Contrasena<input type="password" minLength="6" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>}
          <label>Rol<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
          <label>Estado<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <button className="button primary" type="submit">{editingId ? 'Guardar cambios' : 'Crear usuario'}</button>
          {editingId && <button className="button secondary" type="button" onClick={() => { setEditingId(''); setForm(emptyForm); }}>Cancelar edicion</button>}
        </form>
      </section>

      <section className="page-stack">
        <h3>Cambiar contrasena</h3>
        <form className="form-grid" onSubmit={changePassword}>
          <label>Usuario<select value={passwordForm.userId} onChange={(e) => setPasswordForm({ ...passwordForm, userId: e.target.value })} required><option value="">Seleccionar</option>{users.map((item) => <option key={item._id} value={item._id}>{item.name} - {item.email}</option>)}</select></label>
          <label>Nueva contrasena<input type="password" minLength="6" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} required /></label>
          <button className="button primary" type="submit">Cambiar contrasena</button>
        </form>
      </section>

      <div className="module-toolbar">
        <input placeholder="Buscar por nombre, email o rol" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}><option value="">Todos los roles</option>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Todos los estados</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>
        <button className="button secondary" type="button" onClick={loadUsers}>Filtrar</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Ultimo login</th><th>Creado</th><th>Acciones</th></tr></thead>
          <tbody>
            {users.map((item) => (
              <tr key={item._id}>
                <td>{item.name}</td>
                <td>{item.email}</td>
                <td><span className="badge info">{item.role}</span></td>
                <td><span className={`badge ${item.status === 'activo' ? 'activo' : 'bloqueado'}`}>{item.status || 'activo'}</span></td>
                <td>{item.lastLogin ? new Date(item.lastLogin).toLocaleString('es-CO') : '-'}</td>
                <td>{item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-CO') : '-'}</td>
                <td className="actions-cell">
                  <button className="button secondary" type="button" onClick={() => startEdit(item)}>Editar</button>
                  {item.status !== 'bloqueado' && <button className="button danger" type="button" onClick={() => changeStatus(item, 'bloqueado')}>Bloquear</button>}
                  {item.status !== 'activo' && <button className="button secondary" type="button" onClick={() => changeStatus(item, 'activo')}>Activar</button>}
                  <button className="button danger" type="button" onClick={() => deleteUser(item)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
