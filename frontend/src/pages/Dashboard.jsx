import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import api from '../api/axios';
import BackendStatus from '../components/BackendStatus';
import ChartCard from '../components/ChartCard';
import DateFilter from '../components/DateFilter';
import KpiCard from '../components/KpiCard';
import QuickActions from '../components/QuickActions';
import { exportToCsv } from '../utils/exportUtils';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const percent = (value) => `${Number(value || 0).toFixed(2)}%`;
const chartColors = ['#11845b', '#2563eb', '#f2a900', '#c24136', '#7c3aed', '#0f766e'];

const tabs = [
  { id: 'summary', label: 'Resumen' },
  { id: 'sales', label: 'Ventas' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'finance', label: 'Finanzas' },
  { id: 'alerts', label: 'Alertas' }
];

const moduleLabels = {
  products: 'Productos',
  batches: 'Lotes',
  dashboard: 'Dashboard',
  expenses: 'Gastos',
  reconciliation: 'Conciliación',
  dataCleanup: 'Limpieza de datos',
  wastes: 'Mermas',
  customers: 'Clientes',
  payments: 'Pagos / Cartera',
  sales: 'Ventas',
  purchases: 'Compras',
  suppliers: 'Proveedores'
};

const moduleRoutes = {
  products: '/products',
  batches: '/batches',
  expenses: '/expenses',
  reconciliation: '/reconciliation',
  dataCleanup: '/data-cleanup',
  wastes: '/wastes',
  customers: '/customers',
  payments: '/payments',
  sales: '/sales',
  purchases: '/purchases',
  suppliers: '/suppliers',
  dashboard: '/dashboard'
};

const severityLabels = {
  danger: 'Críticas',
  warning: 'Advertencias',
  info: 'Informativas',
  success: 'Informativas'
};

const periodLabels = {
  today: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  month: 'Mes actual',
  quarter: 'Trimestre'
};

function AlertSummary({ groupedAlerts, onViewAll }) {
  const critical = groupedAlerts.danger.length;
  const warnings = groupedAlerts.warning.length;
  const info = groupedAlerts.info.length + groupedAlerts.success.length;

  return (
    <section className="alert-summary">
      <article className="alert-summary-item alert-critical">
        <span>Críticas</span>
        <strong>{critical}</strong>
        <small>{critical === 1 ? 'requiere atención' : 'requieren atención'}</small>
      </article>
      <article className="alert-summary-item alert-warning">
        <span>Advertencias</span>
        <strong>{warnings}</strong>
        <small>para revisar</small>
      </article>
      <article className="alert-summary-item alert-info">
        <span>Informativas</span>
        <strong>{info}</strong>
        <small>estado operativo</small>
      </article>
      <button className="button secondary" type="button" onClick={onViewAll}>Ver todas</button>
    </section>
  );
}

function AlertGroups({ groupedAlerts, onNavigate }) {
  const sections = ['danger', 'warning', 'info', 'success'];
  return (
    <section className="alert-panel">
      <div className="section-heading">
        <h3>Alertas gerenciales</h3>
        <span>Agrupadas por severidad</span>
      </div>
      <div className="alert-groups">
        {sections.map((type) => {
          const alerts = groupedAlerts[type] || [];
          if (alerts.length === 0) return null;
          return (
            <div className="alert-group" key={type}>
              <h4>{severityLabels[type]}</h4>
              <div className="alert-list compact">
                {alerts.map((alert, index) => (
                  <article key={`${alert.title}-${index}`} className={`alert-item ${type}`}>
                    <b>{type === 'danger' ? '!' : type === 'success' ? 'OK' : 'i'}</b>
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.message}</p>
                      <span>{moduleLabels[alert.module] || alert.module || 'General'}</span>
                    </div>
                    {moduleRoutes[alert.module] && (
                      <button className="button ghost" type="button" onClick={() => onNavigate(moduleRoutes[alert.module])}>
                        Ir a {moduleLabels[alert.module] || 'módulo'}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NegativeInsight({ summary }) {
  if (summary.netProfit >= 0 && summary.netMargin >= 0 && summary.roi >= 0) return null;
  return (
    <div className="notice warning">
      Los gastos y costos superan las ventas del período. Revise margen, gastos y costo de mercancía vendida antes de tomar decisiones comerciales.
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [period, setPeriod] = useState('month');
  const [activeTab, setActiveTab] = useState('summary');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const [summaryRes, trendsRes, breakdownRes, alertsRes] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get(`/dashboard/trends?period=${period}`),
        api.get('/dashboard/sales-breakdown'),
        api.get('/dashboard/alerts')
      ]);
      setSummary(summaryRes.data);
      setTrends(trendsRes.data);
      setBreakdown(breakdownRes.data);
      setAlerts(alertsRes.data);
    };

    load().catch((err) => setError(err.response?.data?.message || err.userMessage || 'Error cargando dashboard.'));
  }, [period]);

  const groupedAlerts = useMemo(() => ({
    danger: alerts.filter((alert) => alert.type === 'danger'),
    warning: alerts.filter((alert) => alert.type === 'warning'),
    info: alerts.filter((alert) => alert.type === 'info'),
    success: alerts.filter((alert) => alert.type === 'success')
  }), [alerts]);

  if (error) return <p className="error">{error}</p>;
  if (!summary) return <p>Cargando dashboard gerencial...</p>;

  const inventoryCritical = Number(summary.lowStockProducts || 0) + Number(summary.productsOutOfStock || 0);
  const criticalAlerts = groupedAlerts.danger.length;
  const barData = [
    { name: 'Ventas', value: summary.totalSales },
    { name: 'CMV', value: summary.totalCMV },
    { name: 'Gastos', value: summary.totalExpenses },
    { name: 'Utilidad', value: summary.netProfit }
  ];

  const exportDashboard = () => {
    exportToCsv('dashboard-gerencial.csv', [
      { Seccion: 'KPI', Concepto: 'Ventas totales', Valor: summary.totalSales, Detalle: `${summary.salesCount} ventas` },
      { Seccion: 'KPI', Concepto: 'Utilidad neta', Valor: summary.netProfit, Detalle: '' },
      { Seccion: 'KPI', Concepto: 'Margen neto', Valor: summary.netMargin, Detalle: '%' },
      { Seccion: 'KPI', Concepto: 'Cuentas por cobrar', Valor: summary.totalReceivables, Detalle: '' },
      { Seccion: 'KPI', Concepto: 'Costo mermas', Valor: summary.totalWasteCost || 0, Detalle: `${summary.wasteCount || 0} registros` },
      ...trends.map((item) => ({ Seccion: 'Tendencia', Concepto: item.label, Valor: item.sales, Detalle: `Utilidad ${item.netProfit}` })),
      ...breakdown.map((item) => ({ Seccion: 'Desglose', Concepto: item.name, Valor: item.value, Detalle: '' })),
      ...alerts.map((alert) => ({ Seccion: 'Alertas', Concepto: alert.title, Valor: alert.type, Detalle: `${moduleLabels[alert.module] || alert.module}: ${alert.message}` }))
    ]);
  };

  const mainKpis = (
    <section className="dashboard-kpi-grid">
      <KpiCard label="Ventas totales" value={money.format(summary.totalSales)} tone="info" helper={`${summary.salesCount} ventas`} />
      <KpiCard label="Utilidad neta" value={money.format(summary.netProfit)} tone={summary.netProfit < 0 ? 'danger' : 'positive'} helper={summary.netProfit < 0 ? 'Costos y gastos superan ventas' : `Margen neto ${percent(summary.netMargin)}`} />
      <KpiCard label="Cuentas por cobrar" value={money.format(summary.totalReceivables)} tone={summary.totalReceivables > 0 ? 'warning' : 'positive'} helper={`${summary.riskCustomers || 0} clientes en riesgo`} />
      <KpiCard label="Inventario crítico" value={inventoryCritical} tone={summary.productsOutOfStock > 0 ? 'danger' : inventoryCritical > 0 ? 'warning' : 'positive'} helper={`${summary.productsOutOfStock || 0} agotados`} />
      <KpiCard label="Lotes vencidos" value={summary.expiredBatches || 0} tone={summary.expiredBatches > 0 ? 'danger' : 'positive'} helper="vencidos con stock disponible" />
      <KpiCard label="Alertas críticas" value={criticalAlerts} tone={criticalAlerts > 0 ? 'danger' : 'positive'} helper={`${groupedAlerts.warning.length} advertencias`} />
    </section>
  );

  const primaryCharts = (
    <section className="dashboard-chart-grid">
      <ChartCard title="Tendencia de ventas y utilidad" subtitle={periodLabels[period] || period}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={trends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={(value) => `$${Math.round(value / 1000000)}M`} />
            <Tooltip formatter={(value) => money.format(value)} />
            <Legend />
            <Area type="monotone" dataKey="sales" name="Ventas" stroke="#2563eb" fill="#dbeafe" />
            <Area type="monotone" dataKey="netProfit" name="Utilidad neta" stroke="#11845b" fill="#dcfce7" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Ventas vs CMV vs gastos">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => `$${Math.round(value / 1000000)}M`} />
            <Tooltip formatter={(value) => money.format(value)} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {barData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );

  const commercialCharts = (
    <section className="dashboard-chart-grid">
      <ChartCard title="Desglose comercial">
        <ResponsiveContainer width="100%" height={290}>
          <PieChart>
            <Pie data={breakdown.slice(0, 2)} dataKey="value" nameKey="name" outerRadius={95} label>
              {breakdown.slice(0, 2).map((entry, index) => <Cell key={entry.name} fill={chartColors[index]} />)}
            </Pie>
            <Tooltip formatter={(value) => money.format(value)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Cartera y estados">
        <ResponsiveContainer width="100%" height={290}>
          <BarChart layout="vertical" data={breakdown.slice(2)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(value) => `$${Math.round(value / 1000000)}M`} />
            <YAxis type="category" dataKey="name" width={130} />
            <Tooltip formatter={(value) => money.format(value)} />
            <Bar dataKey="value" fill="#213a62" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );

  return (
    <div className="dashboard-layout report-print-area">
      <section className="dashboard-header">
        <div>
          <h2>Dashboard gerencial</h2>
          <p>Dulces Epifania Distribuciones S.A.S. · {periodLabels[period] || period}</p>
        </div>
        <div className="dashboard-header-actions">
          <span className={`data-mode ${summary.dataMode}`}>{summary.dataMode === 'real' ? 'Datos reales' : 'Datos de referencia'}</span>
          <BackendStatus compact />
        </div>
      </section>

      {summary.dataMode === 'reference' && (
        <div className="notice warning">Mostrando datos de referencia hasta que existan suficientes movimientos reales.</div>
      )}

      <section className="dashboard-controls no-print">
        <DateFilter value={period} onChange={setPeriod} />
        <div className="dashboard-export-actions">
          <button className="button secondary" type="button" onClick={exportDashboard}>Exportar datos</button>
          <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir dashboard</button>
        </div>
      </section>

      <nav className="dashboard-tabs no-print" aria-label="Vistas del dashboard">
        {tabs.map((tab) => (
          <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} type="button" onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'summary' && (
        <>
          {mainKpis}
          <NegativeInsight summary={summary} />
          {primaryCharts}
          <section className="dashboard-section no-print">
            <div className="section-heading">
              <h3>Acciones rápidas</h3>
              <span>Operación diaria</span>
            </div>
            <QuickActions />
          </section>
          <AlertSummary groupedAlerts={groupedAlerts} onViewAll={() => setActiveTab('alerts')} />
          <section className="dashboard-section">
            <div className="section-heading">
              <h3>Indicadores adicionales</h3>
              <span>Contexto operativo</span>
            </div>
            <div className="secondary-indicators">
              <KpiCard label="ROI mensual" value={percent(summary.roi)} tone={summary.roi < 0 ? 'danger' : 'positive'} />
              <KpiCard label="Punto de equilibrio" value={money.format(summary.breakEvenPoint)} tone="info" />
              <KpiCard label="Margen de seguridad" value={percent(summary.safetyMargin)} tone={summary.safetyMargin < 20 ? 'warning' : 'positive'} />
              <KpiCard label="Ticket promedio" value={money.format(summary.averageTicket)} tone="info" />
              <KpiCard label="Clientes en riesgo" value={summary.riskCustomers} tone={summary.blockedCustomers > 0 ? 'danger' : summary.riskCustomers > 0 ? 'warning' : 'positive'} helper={`${summary.blockedCustomers} bloqueados`} />
              <KpiCard label="Productos críticos" value={inventoryCritical} tone={inventoryCritical > 0 ? 'warning' : 'positive'} />
              <KpiCard label="Lotes próximos" value={summary.expiringBatches || 0} tone={summary.expiringBatches > 0 ? 'warning' : 'positive'} />
              <KpiCard label="Costo de mermas" value={money.format(summary.totalWasteCost || 0)} tone={summary.totalWasteCost > 0 ? 'warning' : 'positive'} />
              <KpiCard label="Stock sin lotes" value={summary.productsWithoutSufficientBatches || 0} tone={summary.productsWithoutSufficientBatches > 0 ? 'warning' : 'positive'} />
            </div>
          </section>
        </>
      )}

      {activeTab === 'sales' && (
        <>
          <section className="dashboard-kpi-grid compact">
            <KpiCard label="Ventas totales" value={money.format(summary.totalSales)} tone="info" helper={`${summary.salesCount} ventas`} />
            <KpiCard label="Ticket promedio" value={money.format(summary.averageTicket)} tone="info" />
            <KpiCard label="Ventas contado" value={money.format(summary.totalPaidSales)} tone="positive" />
            <KpiCard label="Ventas crédito" value={money.format(summary.totalCreditSales)} tone="warning" />
            <KpiCard label="Crédito pendiente" value={money.format(summary.pendingCreditSales)} tone={summary.pendingCreditSales > 0 ? 'warning' : 'positive'} />
          </section>
          {primaryCharts}
          {commercialCharts}
        </>
      )}

      {activeTab === 'inventory' && (
        <>
          <section className="dashboard-kpi-grid compact">
            <KpiCard label="Productos críticos" value={inventoryCritical} tone={inventoryCritical > 0 ? 'warning' : 'positive'} helper={`${summary.productsOutOfStock || 0} agotados`} />
            <KpiCard label="Lotes próximos" value={summary.expiringBatches || 0} tone={summary.expiringBatches > 0 ? 'warning' : 'positive'} />
            <KpiCard label="Lotes vencidos" value={summary.expiredBatches || 0} tone={summary.expiredBatches > 0 ? 'danger' : 'positive'} helper="vencidos con stock disponible" />
            <KpiCard label="Stock sin lotes" value={summary.productsWithoutSufficientBatches || 0} tone={summary.productsWithoutSufficientBatches > 0 ? 'warning' : 'positive'} />
            <KpiCard label="Mermas" value={money.format(summary.totalWasteCost || 0)} tone={summary.totalWasteCost > 0 ? 'warning' : 'positive'} helper={`${summary.wasteCount || 0} registros`} />
          </section>
          <section className="dashboard-section">
            <div className="section-heading">
              <h3>Acciones de inventario</h3>
              <span>Gestión segura</span>
            </div>
            <div className="quick-actions">
              <button className="button secondary" type="button" onClick={() => navigate('/products')}>Ver productos</button>
              <button className="button secondary" type="button" onClick={() => navigate('/batches')}>Gestionar lotes</button>
              <button className="button secondary" type="button" onClick={() => navigate('/wastes')}>Ver mermas</button>
              <button className="button secondary" type="button" onClick={() => navigate('/kardex')}>Consultar kardex</button>
            </div>
          </section>
          <AlertGroups groupedAlerts={{ ...groupedAlerts, danger: groupedAlerts.danger.filter((alert) => ['products', 'batches', 'dataCleanup'].includes(alert.module)), warning: groupedAlerts.warning.filter((alert) => ['products', 'batches', 'dataCleanup', 'wastes'].includes(alert.module)), info: [], success: [] }} onNavigate={navigate} />
        </>
      )}

      {activeTab === 'finance' && (
        <>
          <section className="dashboard-kpi-grid compact">
            <KpiCard label="Utilidad neta" value={money.format(summary.netProfit)} tone={summary.netProfit < 0 ? 'danger' : 'positive'} />
            <KpiCard label="Margen neto" value={percent(summary.netMargin)} tone={summary.netMargin < 0 ? 'danger' : 'positive'} />
            <KpiCard label="ROI" value={percent(summary.roi)} tone={summary.roi < 0 ? 'danger' : 'positive'} />
            <KpiCard label="Gastos" value={money.format(summary.totalExpenses)} tone="warning" />
            <KpiCard label="Punto de equilibrio" value={money.format(summary.breakEvenPoint)} tone="info" />
            <KpiCard label="Cuentas por cobrar" value={money.format(summary.totalReceivables)} tone={summary.totalReceivables > 0 ? 'warning' : 'positive'} />
          </section>
          <NegativeInsight summary={summary} />
          {primaryCharts}
          {commercialCharts}
        </>
      )}

      {activeTab === 'alerts' && <AlertGroups groupedAlerts={groupedAlerts} onNavigate={navigate} />}
    </div>
  );
}
