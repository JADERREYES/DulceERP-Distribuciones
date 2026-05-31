import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Reconciliation() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [details, setDetails] = useState(null);
  const [preview, setPreview] = useState(null);
  const [repairResult, setRepairResult] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canSeeFinancial = ['admin', 'contador'].includes(user?.role);

  const load = async () => {
    setError('');
    setSuccess('');
    try {
      const inventoryRes = await api.get('/reconciliation/inventory');
      setInventory(inventoryRes.data);
      if (canSeeFinancial) {
        const financialRes = await api.get('/reconciliation/financial');
        setFinancial(financialRes.data);
      }
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error cargando conciliacion.');
    }
  };

  useEffect(() => {
    load();
  }, [canSeeFinancial]);

  const loadDetails = async () => {
    setError('');
    try {
      const res = await api.get('/reconciliation/financial/details');
      setDetails(res.data);
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error cargando diagnostico.');
    }
  };

  const loadPreview = async () => {
    setError('');
    try {
      const res = await api.post('/reconciliation/financial/repair-preview');
      setPreview(res.data);
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error generando vista previa.');
    }
  };

  const applyRepair = async () => {
    setError('');
    setSuccess('');
    const ok = window.confirm('Esta accion ajustara saldos contables de clientes y proveedores segun ventas y compras pendientes. No elimina registros. Deseas continuar?');
    if (!ok) return;
    try {
      const res = await api.post('/reconciliation/financial/repair-apply', { confirm: true });
      setRepairResult(res.data);
      setSuccess('Reparacion aplicada correctamente.');
      await load();
      await loadPreview();
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || 'Error aplicando reparacion.');
    }
  };

  if (!inventory && !error) return <p>Cargando conciliacion...</p>;

  return (
    <div className="page-stack">
      <div className="page-title">
        <h2>Conciliacion</h2>
        <p>Validacion entre inventario, kardex, cartera y cuentas por pagar.</p>
      </div>
      <button className="button primary" type="button" onClick={load}>Actualizar conciliacion</button>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      {inventory && (
        <>
          <section className="kpi-grid">
            <article className="kpi-card info"><span>Productos</span><strong>{inventory.totalProducts}</strong><small>modo {inventory.mode}</small></article>
            <article className="kpi-card positive"><span>Consistentes</span><strong>{inventory.consistentProducts}</strong></article>
            <article className={`kpi-card ${inventory.inconsistentProducts > 0 ? 'danger' : 'positive'}`}><span>Inconsistentes</span><strong>{inventory.inconsistentProducts}</strong></article>
          </section>
          {inventory.mode === 'partial' && <div className="notice warning">Conciliacion parcial: algunos productos no tienen stock inicial historico en kardex.</div>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th>Stock actual</th><th>Stock kardex</th><th>Dif. kardex</th><th>Stock lotes</th><th>Dif. lotes</th><th>Estado</th><th>Nota</th></tr></thead>
              <tbody>
                {inventory.items.map((item) => (
                  <tr key={item.productId} className={item.status === 'inconsistent' ? 'row-bloqueado' : ''}>
                    <td>{item.name}</td>
                    <td>{item.currentStock}</td>
                    <td>{item.kardexCalculatedStock ?? '-'}</td>
                    <td>{item.difference ?? '-'}</td>
                    <td>{item.batchCalculatedStock ?? '-'}</td>
                    <td>{item.batchDifference ?? '-'}</td>
                    <td><span className={`badge ${item.status === 'consistent' ? 'activo' : item.status === 'partial' ? 'riesgo' : 'bloqueado'}`}>{item.status}</span></td>
                    <td>{item.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {canSeeFinancial && financial && (
        <>
          <section className="kpi-grid">
            <article className={`kpi-card ${financial.receivables.difference === 0 ? 'positive' : 'danger'}`}><span>Diferencia cartera</span><strong>{money.format(financial.receivables.difference)}</strong></article>
            <article className={`kpi-card ${financial.payables.difference === 0 ? 'positive' : 'danger'}`}><span>Diferencia proveedores</span><strong>{money.format(financial.payables.difference)}</strong></article>
          </section>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Concepto</th><th>Saldo maestro</th><th>Pendiente documentos</th><th>Diferencia</th></tr></thead>
              <tbody>
                <tr><td>Cuentas por cobrar</td><td>{money.format(financial.receivables.customersDebt)}</td><td>{money.format(financial.receivables.pendingCreditSales)}</td><td>{money.format(financial.receivables.difference)}</td></tr>
                <tr><td>Cuentas por pagar</td><td>{money.format(financial.payables.suppliersDebt)}</td><td>{money.format(financial.payables.pendingCreditPurchases)}</td><td>{money.format(financial.payables.difference)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="module-toolbar">
            <button className="button secondary" type="button" onClick={loadDetails}>Ver diagnostico</button>
            <button className="button secondary" type="button" onClick={loadPreview}>Vista previa de reparacion</button>
            {user?.role === 'admin' && <button className="button danger" type="button" onClick={applyRepair}>Aplicar reparacion</button>}
          </div>
          <div className="notice warning">La reparacion ajusta solo saldos currentDebt segun balances pendientes. No elimina ventas, compras, pagos, clientes ni proveedores.</div>

          {details && (
            <section className="page-stack">
              <h3>Detalle de diferencias</h3>
              <div className="split-grid">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Cliente</th><th>Deuda</th><th>Esperado</th><th>Diferencia</th><th>Razon</th></tr></thead>
                    <tbody>
                      {details.customers.unmatchedCustomerDebts.concat(details.customers.pendingSalesWithoutCustomerDebt).map((item, index) => (
                        <tr key={`${item.id}-${index}`}>
                          <td>{item.name}</td><td>{money.format(item.debt)}</td><td>{money.format(item.expectedDebt)}</td><td>{money.format(item.difference)}</td><td>{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="notice info">{details.customers.possibleCauses.join(' ')}</div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Proveedor</th><th>Deuda</th><th>Esperado</th><th>Diferencia</th><th>Razon</th></tr></thead>
                    <tbody>
                      {details.suppliers.unmatchedSupplierDebts.concat(details.suppliers.pendingPurchasesWithoutSupplierDebt).map((item, index) => (
                        <tr key={`${item.id}-${index}`}>
                          <td>{item.name}</td><td>{money.format(item.debt)}</td><td>{money.format(item.expectedDebt)}</td><td>{money.format(item.difference)}</td><td>{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="notice info">{details.suppliers.possibleCauses.join(' ')}</div>
                </div>
              </div>
            </section>
          )}

          {preview && (
            <section className="page-stack">
              <h3>Vista previa de reparacion</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Tipo</th><th>Nombre</th><th>Saldo actual</th><th>Saldo esperado</th><th>Diferencia</th><th>Accion propuesta</th></tr></thead>
                  <tbody>
                    {preview.customersFixes.map((item) => <tr key={`c-${item.customerId}`}><td>Cliente</td><td>{item.name}</td><td>{money.format(item.currentDebt)}</td><td>{money.format(item.expectedDebt)}</td><td>{money.format(item.difference)}</td><td>{item.proposedAction}</td></tr>)}
                    {preview.suppliersFixes.map((item) => <tr key={`s-${item.supplierId}`}><td>Proveedor</td><td>{item.name}</td><td>{money.format(item.currentDebt)}</td><td>{money.format(item.expectedDebt)}</td><td>{money.format(item.difference)}</td><td>{item.proposedAction}</td></tr>)}
                    {preview.customersFixes.length + preview.suppliersFixes.length === 0 && <tr><td colSpan="6">No hay ajustes propuestos.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {repairResult && (
            <div className="notice success">
              Clientes actualizados: {repairResult.customersUpdated}. Proveedores actualizados: {repairResult.suppliersUpdated}.
            </div>
          )}
        </>
      )}
    </div>
  );
}
