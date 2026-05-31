const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Sale = require('../models/Sale');

const search = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ products: [], customers: [], sales: [] });
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const customerMatches = await Customer.find({
      $or: [{ name: regex }, { document: regex }, { phone: regex }, { email: regex }, { zone: regex }]
    })
      .select('name document phone email zone status currentDebt')
      .limit(8);

    const customerIds = customerMatches.map((customer) => customer._id);
    const saleOr = [{ customer: { $in: customerIds } }];
    if (mongoose.Types.ObjectId.isValid(q)) saleOr.push({ _id: q });

    const [products, sales] = await Promise.all([
      Product.find({ $or: [{ name: regex }, { sku: regex }, { category: regex }] })
        .select('name sku category stock status salePrice')
        .limit(8),
      Sale.find({ $or: saleOr })
        .populate('customer', 'name document')
        .select('customer total paymentMethod paymentStatus status createdAt')
        .sort({ createdAt: -1 })
        .limit(8)
    ]);

    return res.json({ products, customers: customerMatches, sales });
  } catch (error) {
    return res.status(500).json({ message: 'Error ejecutando busqueda global.', error: error.message });
  }
};

module.exports = { search };
