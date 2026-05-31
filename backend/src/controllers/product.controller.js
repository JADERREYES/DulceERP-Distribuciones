const Product = require('../models/Product');
const { paginatedResponse } = require('../utils/pagination');
const { createAuditLog } = require('../utils/auditLogger');

const getProducts = async (req, res) => {
  try {
    const { search, status, category } = req.query;
    const filter = {};
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { sku: regex }, { category: regex }];
    }
    if (status) filter.status = status;
    if (category) filter.category = category;

    return res.json(await paginatedResponse(Product, { filter, query: req.query, sortDefault: { createdAt: -1 } }));
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando productos.', error: error.message });
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
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado.' });
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

module.exports = { getProducts, createProduct, getProductById, updateProduct, deleteProduct };
