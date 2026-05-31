const Customer = require('../models/Customer');
const Product = require('../models/Product');

const receivables = async (req, res) => {
  try {
    const customers = await Customer.find({ currentDebt: { $gt: 0 } })
      .select('name document phone zone creditLimit currentDebt status')
      .sort({ currentDebt: -1 });

    return res.json(
      customers.map((customer) => ({
        _id: customer._id,
        name: customer.name,
        document: customer.document,
        phone: customer.phone,
        zone: customer.zone,
        creditLimit: customer.creditLimit,
        currentDebt: customer.currentDebt,
        status: customer.status,
        creditUsagePercent:
          Number(customer.creditLimit || 0) > 0
            ? Number(((Number(customer.currentDebt || 0) / Number(customer.creditLimit)) * 100).toFixed(2))
            : 100
      }))
    );
  } catch (error) {
    return res.status(500).json({ message: 'Error generando reporte de cartera.', error: error.message });
  }
};

const mapProduct = (product) => ({
  _id: product._id,
  name: product.name,
  category: product.category,
  sku: product.sku,
  stock: product.stock,
  minStock: product.minStock,
  unitCost: product.unitCost,
  salePrice: product.salePrice,
  expirationDate: product.expirationDate,
  status: product.status,
  inventoryValue: Number(product.stock || 0) * Number(product.unitCost || 0)
});

const inventoryRisk = async (req, res) => {
  try {
    const now = new Date();
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);

    const [outOfStockProducts, lowStockProducts, nearExpirationProducts, topInventoryValueProducts] = await Promise.all([
      Product.find({ $or: [{ status: 'agotado' }, { stock: { $lte: 0 } }] }).sort({ name: 1 }),
      Product.find({
        $or: [{ status: 'bajo_stock' }, { $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$minStock'] }] } }]
      }).sort({ stock: 1 }),
      Product.find({ expirationDate: { $gte: now, $lte: limit } }).sort({ expirationDate: 1 }),
      Product.aggregate([
        {
          $addFields: {
            inventoryValue: { $multiply: ['$stock', '$unitCost'] }
          }
        },
        { $sort: { inventoryValue: -1 } },
        { $limit: 10 }
      ])
    ]);

    return res.json({
      outOfStockProducts: outOfStockProducts.map(mapProduct),
      lowStockProducts: lowStockProducts.map(mapProduct),
      nearExpirationProducts: nearExpirationProducts.map(mapProduct),
      topInventoryValueProducts: topInventoryValueProducts.map((product) => ({
        ...mapProduct(product),
        inventoryValue: product.inventoryValue
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error generando reporte de inventario.', error: error.message });
  }
};

module.exports = { receivables, inventoryRisk };
