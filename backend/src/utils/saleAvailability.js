const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');

const number = (value) => Number(value || 0);

const startOfDay = (date = new Date()) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const diffDays = (from, to) => Math.floor((startOfDay(to) - startOfDay(from)) / (1000 * 60 * 60 * 24));

const isSellableBatch = (batch, referenceDate = new Date()) => {
  const expirationDate = batch.expirationDate ? startOfDay(batch.expirationDate) : null;
  return (
    number(batch.availableQuantity) > 0 &&
    !['vencido', 'bloqueado', 'agotado'].includes(batch.status) &&
    expirationDate &&
    expirationDate >= startOfDay(referenceDate)
  );
};

const batchNonSellableReason = (batch, referenceDate = new Date()) => {
  if (number(batch.availableQuantity) <= 0 || batch.status === 'agotado') return 'Lote agotado';
  if (batch.status === 'bloqueado') return 'Lote bloqueado';
  if (batch.status === 'vencido') return 'Lote vencido';
  if (batch.expirationDate && startOfDay(batch.expirationDate) < startOfDay(referenceDate)) return 'Lote vencido';
  return 'Lote no disponible para venta';
};

const serializeSellableBatch = (batch, referenceDate = new Date()) => ({
  _id: batch._id,
  batchNumber: batch.batchNumber,
  availableQuantity: number(batch.availableQuantity),
  expirationDate: batch.expirationDate,
  daysToExpire: batch.expirationDate ? diffDays(referenceDate, batch.expirationDate) : null,
  status: batch.status
});

const serializeNonSellableBatch = (batch, referenceDate = new Date()) => ({
  _id: batch._id,
  batchNumber: batch.batchNumber,
  availableQuantity: number(batch.availableQuantity),
  expirationDate: batch.expirationDate,
  daysExpired: batch.expirationDate && startOfDay(batch.expirationDate) < startOfDay(referenceDate)
    ? diffDays(batch.expirationDate, referenceDate)
    : 0,
  status: batch.status,
  reason: batchNonSellableReason(batch, referenceDate)
});

const summarizeBatchAvailability = (product, batches, referenceDate = new Date()) => {
  const sellableBatches = batches
    .filter((batch) => isSellableBatch(batch, referenceDate))
    .sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate) || new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const nonSellableBatches = batches.filter((batch) => !isSellableBatch(batch, referenceDate));

  const generalStock = number(product.stock);
  const sellableBatchQuantity = sellableBatches.reduce((total, batch) => total + number(batch.availableQuantity), 0);
  const expiredBatchQuantity = nonSellableBatches
    .filter((batch) => batch.status === 'vencido' || (batch.expirationDate && startOfDay(batch.expirationDate) < startOfDay(referenceDate)))
    .reduce((total, batch) => total + number(batch.availableQuantity), 0);
  const blockedBatchQuantity = nonSellableBatches
    .filter((batch) => batch.status === 'bloqueado')
    .reduce((total, batch) => total + number(batch.availableQuantity), 0);
  const exhaustedBatchQuantity = nonSellableBatches
    .filter((batch) => number(batch.availableQuantity) <= 0 || batch.status === 'agotado')
    .reduce((total, batch) => total + number(batch.availableQuantity), 0);
  const maxSellableQuantity = Math.min(generalStock, sellableBatchQuantity);
  const stockWithoutSellableBatch = Math.max(generalStock - sellableBatchQuantity, 0);
  const warnings = [];
  const recommendations = [];

  if (generalStock > sellableBatchQuantity) {
    warnings.push('El producto tiene stock general mayor que lotes vendibles.');
  }
  if (expiredBatchQuantity > 0) {
    warnings.push('Existen lotes vencidos con unidades disponibles.');
    recommendations.push('Si el lote vencio realmente, registre merma por vencimiento.');
    recommendations.push('Si la fecha fue digitada mal, corrija vencimiento con razon.');
  }
  if (blockedBatchQuantity > 0) {
    warnings.push('Existen lotes bloqueados con unidades disponibles.');
    recommendations.push('Revise el motivo de bloqueo antes de habilitar el lote.');
  }
  if (generalStock > 0 && sellableBatchQuantity <= 0) {
    warnings.push('El producto tiene stock general, pero no tiene lotes vendibles.');
    recommendations.push('Si existe mercancia fisica sin lote, cargue lote real desde Limpieza de datos.');
  }
  if (sellableBatchQuantity > generalStock) {
    warnings.push('Los lotes vendibles superan el stock general del producto.');
    recommendations.push('Revise conciliacion de inventario antes de vender cantidades altas.');
  }
  if (recommendations.length === 0) {
    recommendations.push('La disponibilidad FEFO permite vender hasta el maximo vendible indicado.');
  }

  return {
    product: {
      _id: product._id,
      name: product.name,
      sku: product.sku,
      stock: generalStock,
      salePrice: number(product.salePrice),
      unitCost: number(product.unitCost)
    },
    availability: {
      generalStock,
      sellableBatchQuantity,
      expiredBatchQuantity,
      blockedBatchQuantity,
      exhaustedBatchQuantity,
      stockWithoutSellableBatch,
      canSell: maxSellableQuantity > 0,
      maxSellableQuantity
    },
    sellableBatches: sellableBatches.map((batch) => serializeSellableBatch(batch, referenceDate)),
    nonSellableBatches: nonSellableBatches.map((batch) => serializeNonSellableBatch(batch, referenceDate)),
    warnings,
    recommendations
  };
};

const getProductSaleAvailability = async (productId, options = {}) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error('Producto no encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const referenceDate = options.referenceDate || new Date();
  const productQuery = Product.findById(productId).select('name sku stock salePrice unitCost');
  if (options.session) productQuery.session(options.session);
  const product = await productQuery.lean();
  if (!product) {
    const error = new Error('Producto no encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const batchesQuery = ProductBatch.find({ product: product._id })
    .select('batchNumber availableQuantity expirationDate status createdAt')
    .sort({ expirationDate: 1, createdAt: 1 });
  if (options.session) batchesQuery.session(options.session);
  const batches = await batchesQuery.lean();

  return summarizeBatchAvailability(product, batches, referenceDate);
};

const getSellableBatches = async (productId, options = {}) => {
  const data = await getProductSaleAvailability(productId, options);
  return data.sellableBatches;
};

module.exports = {
  getProductSaleAvailability,
  getSellableBatches,
  summarizeBatchAvailability,
  isSellableBatch
};
