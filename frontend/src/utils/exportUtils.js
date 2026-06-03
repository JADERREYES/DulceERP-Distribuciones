export const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));

export const formatDate = (value, withTime = false) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return withTime ? date.toLocaleString('es-CO') : date.toLocaleDateString('es-CO');
};

export const normalizeRowsForExport = (rows, columns) => {
  if (!Array.isArray(rows)) return [];
  if (!Array.isArray(columns) || columns.length === 0) return rows;

  return rows.map((row) =>
    columns.reduce((exportRow, column) => {
      const header = column.header || column.label || column.key;
      const value = typeof column.value === 'function' ? column.value(row) : row[column.key];
      exportRow[header] = value ?? '';
      return exportRow;
    }, {})
  );
};

const csvValue = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/"/g, '""');
  return /[",\n\r;]/.test(text) ? `"${text}"` : text;
};

export const exportToCsv = (filename, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return false;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(csvValue).join(';'),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(';'))
  ].join('\r\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
};
