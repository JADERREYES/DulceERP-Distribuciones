const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const applyDateRange = (filter, query, field = 'createdAt') => {
  const { from, to } = query;
  if (!from && !to) return filter;

  const range = {};
  if (from) {
    const fromDate = new Date(from);
    if (!Number.isNaN(fromDate.getTime())) range.$gte = fromDate;
  }
  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999);
      range.$lte = toDate;
    }
  }

  if (Object.keys(range).length > 0) filter[field] = range;
  return filter;
};

module.exports = { applyDateRange, escapeRegex };
