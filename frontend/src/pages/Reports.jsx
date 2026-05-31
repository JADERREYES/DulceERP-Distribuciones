import { useEffect, useState } from 'react';
import api from '../api/axios';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const todayISO = () => new Date().toISOString().slice(0, 10);

const periodRange = (period) => {
  const now = new Date();
  const from = new Date(now);

  if (period === 'today') return { from: todayISO(), to: todayISO(), label: 'Hoy' };

  if (period === 'month') {
    from.setDate(1);
    return { from: from.toISOString().slice(0, 10), to: todayISO(), label: 'Mes actual' };
  }

  if (period === '30d') {
    from.setDate(now.getDate() - 30);
    return { from: from.toISOString().slice(0, 10), to: todayISO(), label: 'Ultimos 30 dias' };
  }

  if (period === 'quarter') {
    from.setDate(now.getDate() - 90);
    return { from: from.toISOString().slice(0, 10), to: todayISO(), label: 'Trimestre' };
  }

  return { from: '', to: '', label: 'Todo' };
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('es-CO') : '-');
const list = (value) => (Array.isArray(value) ? value : []);

function Kpi({ title, value, detail, tone = 'info' }) {
  return (
    <article className={`kpi-card ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function EmptyRow({ colSpan, message = 'Sin datos para mostrar.' }) {
  return (
    <tr>
      <td colSpan={colSpan}>{message}</td>
    </tr>
  );
}

export default function Reports() {
  const [filters, setFilters] = useState(periodRange('month'));
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const queryString = () => {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    const query = params.toString();
    return query ? `?${query}` : '';
  };

  const loadReports = async () => {
    setError('');
    setLoading(true);
    try {
      const query = queryString();
      const [summary, income, inventory, receivables, payables, wastes, audit] = await Promise.all([
        api.get(`/executive-reports/summary${query}`),
        api.get(`/executive-reports/income-statement${query}`),
        api.get('/executive-reports/inventory-valuation'),
        api.get('/executive-reports/receivables'),
        api.get('/executive-reports/payables'),
        api.get(`/executive-reports/wastes${query}`),
        api.get(`/executive-reports/audit-summary${query}`)
      ]);
      setReports({
        summary: summary.data,
        income: income.data,
        inventory: inventory.data,
        receivables: receivables.data,
        payables: payables.data,
        wastes: wastes.data,
        audit: audit.data
      });
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error cargando reportes ejecutivos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const applyPeriod = (period) => setFilters(periodRange(period));

  if (!reports && loading) return <p>Cargando reportes ejecutivos...</p>;

  return (
    <div className="page-stack report-print-area">
      <div className="page-title">
        <h2>Reportes ejecutivos</h2>
        <p>Estados gerenciales, inventario, cartera, proveedores, mermas y auditoria resumida.</p>
      </div>

      <section className="module-toolbar no-print">
        <button className="button secondary" type="button" onClick={() => applyPeriod('today')}>Hoy</button>
        <button className="button secondary" type="button" onClick={() => applyPeriod('month')}>Mes actual</button>
        <button className="button secondary" type="button" onClick={() => applyPeriod('30d')}>Ultimos 30 dias</button>
        <button className="button secondary" type="button" onClick={() => applyPeriod('quarter')}>Trimestre</button>
        <label>Desde<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value, label: 'Personalizado' })} /></label>
        <label>Hasta<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value, label: 'Personalizado' })} /></label>
        <button className="button primary" type="button" onClick={loadReports} disabled={loading}>{loading ? 'Consultando...' : 'Consultar'}</button>
        <button className="button ghost" type="button" onClick={() => window.print()}>Imprimir reporte</button>
      </section>

      {error && <p className="error">{error}</p>}
      {!reports && !loading && <div className="notice info">Ejecute una consulta para ver los reportes.</div>}

      {reports && (
        <>
          <section className="executive-header">
            <div>
              <h2>Resumen ejecutivo</h2>
              <p>Periodo: {filters.from || 'inicio'} a {filters.to || 'hoy'} · Datos reales del ERP</p>
            </div>
            <span className="data-mode real">Modo real</span>
          </section>

          {reports.summary.mainAlerts?.length > 0 && (
            <section className="alert-panel">
              <div className="section-heading">
                <h3>Alertas principales</h3>
                <span>{reports.summary.mainAlerts.length} alertas</span>
              </div>
              <div className="alert-list">
                {reports.summary.mainAlerts.map((alert) => (
                  <article className={`alert-item ${alert.type}`} key={`${alert.title}-${alert.message}`}>
                    <b>!</b>
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.message}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="kpi-grid">
            <Kpi title="Ventas" value={money.format(reports.summary.sales)} detail={`${reports.income.salesCount} ventas activas`} tone="info" />
            <Kpi title="Utilidad neta" value={money.format(reports.summary.netProfit)} detail={`Margen neto ${reports.income.netMargin}%`} tone={reports.summary.netProfit < 0 ? 'danger' : 'positive'} />
            <Kpi title="Inventario valorizado" value={money.format(reports.summary.inventoryValue)} detail="Segun stock x costo producto" tone="info" />
            <Kpi title="Cuentas por cobrar" value={money.format(reports.summary.receivables)} detail={`${reports.receivables.customersWithDebt} clientes con deuda`} tone={reports.summary.receivables > 0 ? 'warning' : 'positive'} />
            <Kpi title="Cuentas por pagar" value={money.format(reports.summary.payables)} detail={`${reports.payables.suppliersWithDebt} proveedores con deuda`} tone={reports.summary.payables > 0 ? 'warning' : 'positive'} />
            <Kpi title="Mermas" value={money.format(reports.summary.wastes)} detail={`${reports.wastes.wasteCount} registros en periodo`} tone={reports.summary.wastes > 0 ? 'warning' : 'positive'} />
          </section>

          <section className="chart-card">
            <div className="chart-card-header">
              <h3>Estado de resultados</h3>
              <span>{reports.income.message || 'Ventas activas sin incluir anuladas'}</span>
            </div>
            <div className="kpi-grid">
              <Kpi title="Ventas brutas" value={money.format(reports.income.grossSales)} />
              <Kpi title="CMV" value={money.format(reports.income.totalCMV)} />
              <Kpi title="Utilidad bruta" value={money.format(reports.income.grossProfit)} tone={reports.income.grossProfit < 0 ? 'danger' : 'positive'} />
              <Kpi title="Gastos operacionales" value={money.format(reports.income.operationalExpenses)} tone="warning" />
              <Kpi title="Margen bruto" value={`${reports.income.grossMargin}%`} />
              <Kpi title="Ventas anuladas" value={money.format(reports.income.canceledSales)} detail={`${reports.income.canceledSalesCount} anuladas`} tone="danger" />
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Concepto</th><th>Valor</th><th>Detalle</th></tr></thead>
                <tbody>
                  <tr><td>Ventas contado</td><td>{money.format(reports.income.cashSales)}</td><td>Ventas activas pagadas de contado</td></tr>
                  <tr><td>Ventas credito</td><td>{money.format(reports.income.creditSales)}</td><td>Ventas activas a credito</td></tr>
                  <tr><td>Utilidad neta</td><td>{money.format(reports.income.netProfit)}</td><td>Margen neto {reports.income.netMargin}%</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="chart-card">
            <div className="chart-card-header">
              <h3>Inventario valorizado</h3>
              <span>Diferencia producto vs lotes: {money.format(reports.inventory.productVsBatchDifference)}</span>
            </div>
            <div className="kpi-grid">
              <Kpi title="Total productos" value={number.format(reports.inventory.totalProducts)} />
              <Kpi title="Valor por productos" value={money.format(reports.inventory.productInventoryValue)} />
              <Kpi title="Valor por lotes" value={money.format(reports.inventory.batchInventoryValue)} />
              <Kpi title="Stock sin lotes suficientes" value={number.format(list(reports.inventory.stockWithoutEnoughBatches).length)} tone="warning" />
              <Kpi title="Agotados" value={number.format(list(reports.inventory.outOfStockProducts).length)} tone="danger" />
              <Kpi title="Lotes vencidos" value={number.format(list(reports.inventory.expiredBatches).length)} tone="danger" />
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Producto</th><th>SKU</th><th>Stock</th><th>Lotes disponibles</th><th>Faltante</th><th>Costo</th></tr></thead>
                <tbody>
                  {list(reports.inventory.stockWithoutEnoughBatches).length === 0 && <EmptyRow colSpan={6} message="No hay productos con faltante de lotes." />}
                  {list(reports.inventory.stockWithoutEnoughBatches).map((product) => (
                    <tr key={product.productId}>
                      <td>{product.name}</td>
                      <td>{product.sku}</td>
                      <td>{product.stock}</td>
                      <td>{product.batchesAvailable}</td>
                      <td>{product.missingBatchQuantity}</td>
                      <td>{money.format(product.unitCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dashboard-grid">
            <div className="chart-card">
              <div className="chart-card-header">
                <h3>Cartera</h3>
                <span>{money.format(reports.receivables.totalReceivables)} por cobrar</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Cliente</th><th>Documento</th><th>Zona</th><th>Deuda</th><th>Uso cupo</th><th>Estado</th></tr></thead>
                  <tbody>
                    {list(reports.receivables.topCustomersByDebt).length === 0 && <EmptyRow colSpan={6} message="No hay clientes con deuda." />}
                    {list(reports.receivables.topCustomersByDebt).map((customer) => (
                      <tr key={customer.id}>
                        <td>{customer.name}</td>
                        <td>{customer.document}</td>
                        <td>{customer.zone}</td>
                        <td>{money.format(customer.currentDebt)}</td>
                        <td>{customer.creditUsagePercent}%</td>
                        <td><span className={`badge ${customer.status}`}>{customer.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-card-header">
                <h3>Cuentas por pagar</h3>
                <span>{money.format(reports.payables.totalPayables)} pendientes</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Proveedor</th><th>NIT</th><th>Deuda</th><th>Uso cupo</th><th>Estado</th></tr></thead>
                  <tbody>
                    {list(reports.payables.topSuppliersByDebt).length === 0 && <EmptyRow colSpan={5} message="No hay proveedores con deuda." />}
                    {list(reports.payables.topSuppliersByDebt).map((supplier) => (
                      <tr key={supplier.id}>
                        <td>{supplier.name}</td>
                        <td>{supplier.document}</td>
                        <td>{money.format(supplier.currentDebt)}</td>
                        <td>{supplier.creditUsagePercent}%</td>
                        <td><span className={`badge ${supplier.status}`}>{supplier.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="dashboard-grid">
            <div className="chart-card">
              <div className="chart-card-header">
                <h3>Mermas</h3>
                <span>{money.format(reports.wastes.totalWasteCost)} costo total</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Motivo</th><th>Cantidad</th><th>Costo</th></tr></thead>
                  <tbody>
                    {list(reports.wastes.wastesByReason).length === 0 && <EmptyRow colSpan={3} message="No hay mermas en el periodo." />}
                    {list(reports.wastes.wastesByReason).map((item) => (
                      <tr key={item.name}><td>{item.name}</td><td>{item.count}</td><td>{money.format(item.totalCost)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-card-header">
                <h3>Auditoria resumida</h3>
                <span>{reports.audit.totalEvents} eventos</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Fecha</th><th>Usuario</th><th>Modulo</th><th>Accion</th><th>Descripcion</th></tr></thead>
                  <tbody>
                    {list(reports.audit.lastRelevantEvents).length === 0 && <EmptyRow colSpan={5} message="No hay eventos relevantes en el periodo." />}
                    {list(reports.audit.lastRelevantEvents).map((event) => (
                      <tr key={event._id}>
                        <td>{formatDate(event.createdAt)}</td>
                        <td>{event.userName || event.userEmail || 'Sistema'}</td>
                        <td>{event.module}</td>
                        <td>{event.action}</td>
                        <td>{event.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
