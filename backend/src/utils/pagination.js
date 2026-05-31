const buildPagination = (query, defaults = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || defaults.limit || 25, 1), 100);
  const sortBy = query.sortBy || defaults.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  return { page, limit, skip: (page - 1) * limit, sort: { [sortBy]: sortOrder } };
};

const paginatedResponse = async (Model, { filter = {}, query = {}, sortDefault = { createdAt: -1 }, populate = [] }) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy;
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  const sort = sortBy ? { [sortBy]: sortOrder } : sortDefault;

  let findQuery = Model.find(filter).sort(sort).skip(skip).limit(limit);
  populate.forEach((item) => {
    findQuery = findQuery.populate(item);
  });

  const [data, total] = await Promise.all([findQuery, Model.countDocuments(filter)]);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
};

module.exports = { buildPagination, paginatedResponse };
