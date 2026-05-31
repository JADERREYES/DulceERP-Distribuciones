export default function ChartCard({ title, subtitle, children }) {
  return (
    <section className="chart-card">
      <div className="chart-card-header">
        <h3>{title}</h3>
        {subtitle && <span>{subtitle}</span>}
      </div>
      <div className="chart-card-body">{children}</div>
    </section>
  );
}
