import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import BackendStatus from '../components/BackendStatus';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'admin@dulceerp.com', password: 'Admin12345' });
  const [error, setError] = useState('');

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const loggedUser = await login(form.email, form.password);
      const defaultRoutes = {
        admin: '/dashboard',
        contador: '/dashboard',
        vendedor: '/sales',
        bodega: '/products',
        cartera: '/payments',
        repartidor: '/sales'
      };
      navigate(defaultRoutes[loggedUser.role] || '/sales');
    } catch (err) {
      if (err.isBackendConnectionError) {
        setError('No se pudo conectar con el servidor. Inicia el backend con npm run dev.');
        return;
      }

      setError(err.response?.data?.message || 'No fue posible iniciar sesion.');
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-heading">
          <span className="brand-mark large">D</span>
          <div>
            <h1>DulceERP Distribuciones</h1>
            <p>Dulces Epifania Distribuciones S.A.S.</p>
          </div>
        </div>
        <BackendStatus />
        <form onSubmit={handleSubmit} className="form-grid single">
          <label>
            Email
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            Contrasena
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="button primary" type="submit">
            Iniciar sesion
          </button>
        </form>
      </section>
    </main>
  );
}
