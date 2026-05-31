const iconByType = {
  danger: '!',
  warning: 'i',
  success: 'OK',
  info: 'i'
};

export default function AlertPanel({ alerts = [] }) {
  return (
    <section className="alert-panel">
      <div className="section-heading">
        <h3>Alertas gerenciales</h3>
        <span>{alerts.length} alertas</span>
      </div>
      <div className="alert-list">
        {alerts.map((alert, index) => (
          <article key={`${alert.title}-${index}`} className={`alert-item ${alert.type}`}>
            <b>{iconByType[alert.type] || 'i'}</b>
            <div>
              <strong>{alert.title}</strong>
              <p>{alert.message}</p>
              <span>{alert.module}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
