import { useAuth } from '../context/AuthContext';
import GlobalSearch from './GlobalSearch';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="navbar">
      <div>
        <h1>Dulces Epifania Distribuciones S.A.S.</h1>
        <span>Operacion mayorista, cartera e inventario</span>
      </div>
      <GlobalSearch />
      <div className="navbar-user">
        <strong>{user?.name}</strong>
        <span>{user?.role} · {user?.status || 'activo'}</span>
        <button className="button ghost" onClick={logout}>
          Salir
        </button>
      </div>
    </header>
  );
}
