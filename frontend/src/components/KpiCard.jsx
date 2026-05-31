const toneClass = {
  positive: 'positive',
  warning: 'warning',
  danger: 'danger',
  info: 'info'
};

export default function KpiCard({ label, value, helper, tone = 'info' }) {
  return (
    <article className={`kpi-card ${toneClass[tone] || 'info'}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper && <small>{helper}</small>}
    </article>
  );
}
