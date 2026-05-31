import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import Breadcrumbs from './components/Breadcrumbs';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import { useAuth } from './context/AuthContext';
import Customers from './pages/Customers';
import AuditLogs from './pages/AuditLogs';
import Batches from './pages/Batches';
import DataCleanup from './pages/DataCleanup';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Login from './pages/Login';
import Payments from './pages/Payments';
import Products from './pages/Products';
import Purchases from './pages/Purchases';
import Reconciliation from './pages/Reconciliation';
import Reports from './pages/Reports';
import Sales from './pages/Sales';
import SupplierPayments from './pages/SupplierPayments';
import Suppliers from './pages/Suppliers';
import Kardex from './pages/Kardex';
import Wastes from './pages/Wastes';
import Users from './pages/Users';

function PrivateLayout() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <div className="loading">Cargando DulceERP...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-panel">
        <Navbar />
        <section className="content">
          <Breadcrumbs />
          <Outlet />
        </section>
      </main>
    </div>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  const defaultRoutes = {
    admin: '/dashboard',
    contador: '/dashboard',
    vendedor: '/sales',
    bodega: '/products',
    cartera: '/payments',
    repartidor: '/sales'
  };

  return <Navigate to={defaultRoutes[user?.role] || '/sales'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<PrivateLayout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/supplier-payments" element={<SupplierPayments />} />
        <Route path="/kardex" element={<Kardex />} />
        <Route path="/batches" element={<Batches />} />
        <Route path="/wastes" element={<Wastes />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/audit-logs" element={<AuditLogs />} />
        <Route path="/data-cleanup" element={<DataCleanup />} />
        <Route path="/users" element={<Users />} />
      </Route>
    </Routes>
  );
}
