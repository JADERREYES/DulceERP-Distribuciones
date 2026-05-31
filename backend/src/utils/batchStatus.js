const updateBatchStatus = (batch) => {
  const availableQuantity = Number(batch.availableQuantity || 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expirationDate = batch.expirationDate ? new Date(batch.expirationDate) : null;

  if (availableQuantity <= 0) {
    batch.status = 'agotado';
    return batch.status;
  }

  if (expirationDate) {
    expirationDate.setHours(0, 0, 0, 0);
    if (expirationDate < now) {
      batch.status = 'vencido';
      return batch.status;
    }

    const limit = new Date(now);
    limit.setDate(limit.getDate() + 30);
    if (expirationDate <= limit) {
      batch.status = 'proximo_vencer';
      return batch.status;
    }
  }

  batch.status = 'disponible';
  return batch.status;
};

module.exports = { updateBatchStatus };
