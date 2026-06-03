const options = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'month', label: 'Mes actual' },
  { value: 'quarter', label: 'Trimestre' }
];

export default function DateFilter({ value, onChange }) {
  return (
    <div className="date-filter">
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? 'active' : ''}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
