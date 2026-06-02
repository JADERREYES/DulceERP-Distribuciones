import { useEffect, useState } from 'react';
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
import AlertPanel from '../components/AlertPanel';
import BackendStatus from '../components/BackendStatus';
import ChartCard from '../components/ChartCard';
import DateFilter from '../components/DateFilter';
import KpiCard from '../components/KpiCard';
import QuickActions from '../components/QuickActions';
import { exportToCsv } from '../utils/exportUtils';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const percent = (value) => `${Number(value || 0).toFixed(2)}%`;
const chartColors = ['#11845b', '#2563eb', '#f2a900', '#c24136', '#7c3aed', '#0f766e'];

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [period, setPeriod] = useState('month');
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

  if (error) return <p className="error">{error}</p>;
  if (!summary) return <p>Cargando dashboard gerencial...</p>;

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
      ...breakdown.map((item) => ({ Seccion: 'Desglose', Concepto: item.name, Valor: item.value, Detalle: '' }))
    ]);
  };

  return (
    <div className="page-stack executive-dashboard">
      <section className="executive-header">
        <div>
          <h2>Dashboard Gerencial</h2>
          <p>Dulces Epifania Distribuciones S.A.S.</p>
        </div>
        <div className="header-tools">
          <span className={`data-mode ${summary.dataMode}`}>{summary.dataMode === 'real' ? 'Datos reales' : 'Datos de referencia'}</span>
          <BackendStatus />
        </div>
      </section>

      {summary.dataMode === 'reference' && (
        <div className="notice warning">Mostrando datos de referencia hasta que existan suficientes movimientos reales.</div>
      )}

      <DateFilter value={period} onChange={setPeriod} />
      <div className="module-toolbar">
        <button className="button secondary" type="button" onClick={exportDashboard}>Exportar datos</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir dashboard</button>
      </div>
      <QuickActions />

      <section className="kpi-grid">
        <KpiCard label="Ventas totales" value={money.format(summary.totalSales)} tone="info" helper={`${summary.salesCount} ventas`} />
        <KpiCard label="Utilidad neta" value={money.format(summary.netProfit)} tone={summary.netProfit < 0 ? 'danger' : 'positive'} />
        <KpiCard label="Margen neto" value={percent(summary.netMargin)} tone={summary.netMargin < 0 ? 'danger' : 'positive'} />
        <KpiCard label="ROI mensual" value={percent(summary.roi)} tone={summary.roi < 0 ? 'danger' : 'positive'} />
        <KpiCard label="Cuentas por cobrar" value={money.format(summary.totalReceivables)} tone={summary.totalReceivables > 0 ? 'warning' : 'positive'} />
        <KpiCard label="Punto de equilibrio" value={money.format(summary.breakEvenPoint)} tone="info" />
        <KpiCard label="Margen de seguridad" value={percent(summary.safetyMargin)} tone={summary.safetyMargin < 20 ? 'warning' : 'positive'} />
        <KpiCard label="Ticket promedio" value={money.format(summary.averageTicket)} tone="info" />
        <KpiCard label="Clientes en riesgo" value={summary.riskCustomers} tone={summary.blockedCustomers > 0 ? 'danger' : summary.riskCustomers > 0 ? 'warning' : 'positive'} helper={`${summary.blockedCustomers} bloqueados`} />
        <KpiCard label="Productos criticos" value={summary.lowStockProducts + summary.productsOutOfStock} tone={summary.productsOutOfStock > 0 ? 'danger' : summary.lowStockProducts > 0 ? 'warning' : 'positive'} helper={`${summary.nearExpirationCount} proximos a vencer`} />
        <KpiCard label="Lotes proximos" value={summary.expiringBatches || 0} tone={summary.expiredBatches > 0 ? 'danger' : summary.expiringBatches > 0 ? 'warning' : 'positive'} helper={`${summary.expiredBatches || 0} vencidos`} />
        <KpiCard label="Costo mermas" value={money.format(summary.totalWasteCost || 0)} tone={summary.totalWasteCost > 0 ? 'warning' : 'positive'} helper={`${summary.wasteCount || 0} registros`} />
        <KpiCard label="Stock sin lotes" value={summary.productsWithoutSufficientBatches || 0} tone={summary.productsWithoutSufficientBatches > 0 ? 'warning' : 'positive'} helper="Revisar limpieza de datos" />
      </section>

      <section className="dashboard-grid">
        <ChartCard title="Tendencia de ventas y utilidad" subtitle={period}>
          <ResponsiveContainer width="100%" height={290}>
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
          <ResponsiveContainer width="100%" height={290}>
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

      <AlertPanel alerts={alerts} />
    </div>
  );
}
