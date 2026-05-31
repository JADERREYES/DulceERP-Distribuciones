import { useEffect, useState } from 'react';
import api from '../api/axios';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Kardex() {
  const [movements, setMovements] = useState([]);
  const [costs, setCosts] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    const [movementsRes, costsRes] = await Promise.all([api.get('/kardex'), api.get('/kardex/cost-history')]);
    setMovements(movementsRes.data.data || movementsRes.data);
    setCosts(costsRes.data.data || costsRes.data);
  };
  useEffect(() => { load().catch((err) => setError(err.userMessage || err.response?.data?.message || 'Error cargando kardex.')); }, []);

  return (
    <div className="page-stack">
      <div className="page-title"><h2>Kardex</h2><p>Historial de entradas, salidas, anulaciones y costos.</p></div>
      <button className="button primary" type="button" onClick={load}>Actualizar</button>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Lote</th><th>Tipo</th><th>Cantidad</th><th>Stock anterior</th><th>Stock nuevo</th><th>Referencia</th><th>Descripcion</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement._id}><td>{new Date(movement.createdAt).toLocaleString('es-CO')}</td><td>{movement.product?.name}</td><td>{movement.batchNumber || movement.batch?.batchNumber || '-'}</td><td><span className="badge info">{movement.type}</span></td><td>{movement.quantity}</td><td>{movement.previousStock}</td><td>{movement.newStock}</td><td>{movement.referenceType}</td><td>{movement.description}</td></tr>)}</tbody></table></div>
      <div className="table-wrap"><table><thead><tr><th colSpan="6">Costos historicos</th></tr><tr><th>Fecha</th><th>Producto</th><th>Proveedor</th><th>Costo anterior</th><th>Costo nuevo</th><th>Cantidad</th></tr></thead><tbody>{costs.map((cost) => <tr key={cost._id}><td>{new Date(cost.createdAt).toLocaleDateString('es-CO')}</td><td>{cost.product?.name}</td><td>{cost.supplier?.name || '-'}</td><td>{money.format(cost.previousCost)}</td><td>{money.format(cost.newCost)}</td><td>{cost.quantity}</td></tr>)}</tbody></table></div>
    </div>
  );
}
