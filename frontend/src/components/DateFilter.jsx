const options = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: 'Ultimos 7 dias' },
  { value: '30d', label: 'Ultimos 30 dias' },
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
