const Product = require('../models/Product');
const InventoryMovement = require('../models/InventoryMovement');
const ProductBatch = require('../models/ProductBatch');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const { paginatedResponse } = require('../utils/pagination');
const { applyDateRange } = require('../utils/queryFilters');
const { createAuditLog } = require('../utils/auditLogger');
const { getProductSaleAvailability, summarizeBatchAvailability } = require('../utils/saleAvailability');

const getProducts = async (req, res) => {
  try {
    const { search, status, category, stockLow } = req.query;
    const filter = {};
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { sku: regex }, { category: regex }];
    }
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (stockLow === 'true') filter.$expr = { $lte: ['$stock', '$minStock'] };
    applyDateRange(filter, req.query);

    return res.json(await paginatedResponse(Product, { filter, query: req.query, sortDefault: { createdAt: -1 } }));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando productos.', error: error.message });
  }
};

const getSellableProducts = async (req, res) => {
  try {
    const { search, category, onlyAvailable = 'false' } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const filter = {};

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { sku: regex }, { category: regex }];
    }
    if (category) filter.category = category;

    const products = await Product.find(filter)
      .select('name sku category stock salePrice unitCost status')
      .sort({ name: 1 })
      .lean();
    const productIds = products.map((product) => product._id);
    const batches = productIds.length
      ? await ProductBatch.find({ product: { $in: productIds } })
        .select('product batchNumber availableQuantity expirationDate status createdAt')
        .sort({ expirationDate: 1, createdAt: 1 })
        .lean()
      : [];
    const batchesByProduct = batches.reduce((acc, batch) => {
      const key = String(batch.product);
      if (!acc[key]) acc[key] = [];
      acc[key].push(batch);
      return acc;
    }, {});

    const buildNonSellableReason = (availability) => {
      if (availability.availability.maxSellableQuantity > 0) return '';
      if (availability.availability.generalStock <= 0) return 'Sin stock general disponible.';
      if (availability.availability.expiredBatchQuantity > 0 && availability.availability.blockedBatchQuantity > 0) return 'Lotes vencidos o bloqueados sin disponibilidad para venta.';
      if (availability.availability.expiredBatchQuantity > 0) return 'Sin lotes vigentes disponibles para venta.';
      if (availability.availability.blockedBatchQuantity > 0) return 'Lotes bloqueados sin disponibilidad para venta.';
      return 'Sin lotes disponibles para venta.';
    };

    const rows = products.map((product) => {
      const availability = summarizeBatchAvailability(product, batchesByProduct[String(product._id)] || []);
      const sellableQuantity = availability.availability.maxSellableQuantity;
      const expiredQuantity = availability.availability.expiredBatchQuantity;
      const blockedQuantity = availability.availability.blockedBatchQuantity;
      const nextExpirationDate = availability.sellableBatches[0]?.expirationDate || null;

      return {
        _id: product._id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        salePrice: Number(product.salePrice || 0),
        unitCost: Number(product.unitCost || 0),
        generalStock: availability.availability.generalStock,
        sellableQuantity,
        expiredQuantity,
        blockedQuantity,
        nextExpirationDate,
        status: product.status,
        canSell: sellableQuantity > 0,
        reason: buildNonSellableReason(availability),
        warnings: availability.warnings
      };
    });

    const summary = rows.reduce((acc, product) => {
      acc.totalProducts += 1;
      if (product.canSell) acc.sellableProducts += 1;
      if (product.blockedQuantity > 0) acc.blockedProducts += 1;
      if (product.expiredQuantity > 0) acc.expiredProducts += 1;
      acc.totalSellableUnits += product.sellableQuantity;
      return acc;
    }, {
      totalProducts: 0,
      sellableProducts: 0,
      blockedProducts: 0,
      expiredProducts: 0,
      totalSellableUnits: 0
    });

    const filteredRows = onlyAvailable === 'true' ? rows.filter((product) => product.canSell) : rows;
    const total = filteredRows.length;
    const start = (page - 1) * limit;
    const data = filteredRows.slice(start, start + limit);

    return res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1
      },
      summary
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando productos vendibles.', error: error.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const { name, category, sku, stock, minStock, unitCost, salePrice } = req.body;
    if (!name || !category || !sku || unitCost === undefined || salePrice === undefined) {
      return res.status(400).json({ message: 'Nombre, categoria, SKU, costo y precio son obligatorios.' });
    }

    if (Number(stock || 0) < 0 || Number(minStock || 0) < 0 || Number(unitCost) < 0 || Number(salePrice) < 0) {
      return res.status(400).json({ message: 'Stock, stock minimo, costo y precio no pueden ser negativos.' });
    }

    const payload = { ...req.body };
    delete payload.status;

    const product = await Product.create({
      ...payload,
      stock: Number(stock || 0),
      minStock: Number(minStock || 0),
      unitCost: Number(unitCost),
      salePrice: Number(salePrice)
    });

    await createAuditLog({
      req,
      action: 'CREATE',
      module: 'products',
      entityId: product._id,
      entityType: 'Product',
      description: 'Producto creado',
      after: product.toObject()
    });

    return res.status(201).json(product);
  } catch (error) {
    return res.status(400).json({ message: 'Error creando producto.', error: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado.' });
    return res.json(product);
  } catch (error) {
    return res.status(400).json({ message: 'Error consultando producto.', error: error.message });
  }
};

const getProductSaleAvailabilityController = async (req, res) => {
  try {
    const availability = await getProductSaleAvailability(req.params.id);
    return res.json(availability);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Error consultando disponibilidad FEFO del producto.' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const payload = { ...req.body };
    delete payload.status;

    for (const field of ['stock', 'minStock', 'unitCost', 'salePrice']) {
      if (payload[field] !== undefined && Number(payload[field]) < 0) {
        return res.status(400).json({ message: 'Stock, stock minimo, costo y precio no pueden ser negativos.' });
      }
    }

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado.' });
    const before = product.toObject();

    Object.assign(product, payload);
    await product.save();

    await createAuditLog({
      req,
      action: 'UPDATE',
      module: 'products',
      entityId: product._id,
      entityType: 'Product',
      description: 'Producto actualizado',
      before,
      after: product.toObject()
    });

    return res.json(product);
  } catch (error) {
    return res.status(400).json({ message: 'Error actualizando producto.', error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado.' });

    const [sales, purchases, batches, movements] = await Promise.all([
      Sale.countDocuments({ 'items.product': product._id }),
      Purchase.countDocuments({ 'items.product': product._id }),
      ProductBatch.countDocuments({ product: product._id }),
      InventoryMovement.countDocuments({ product: product._id })
    ]);

    if (sales || purchases || batches || movements) {
      return res.status(409).json({
        message: 'No se puede eliminar el producto porque tiene movimientos asociados.',
        details: { sales, purchases, batches, movements }
      });
    }

    await Product.deleteOne({ _id: product._id });
    await createAuditLog({
      req,
      action: 'DELETE',
      module: 'products',
      entityId: product._id,
      entityType: 'Product',
      description: 'Producto eliminado',
      before: product.toObject()
    });
    return res.json({ message: 'Producto eliminado correctamente.' });
  } catch (error) {
    return res.status(400).json({ message: 'Error eliminando producto.', error: error.message });
  }
};

module.exports = { getProducts, getSellableProducts, createProduct, getProductById, getProductSaleAvailabilityController, updateProduct, deleteProduct };
