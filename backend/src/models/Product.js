const mongoose = require('mongoose');

const PRODUCT_STATUSES = ['disponible', 'bajo_stock', 'agotado', 'proximo_vencer'];

const calculateProductStatus = (product) => {
  const stock = Number(product.stock || 0);
  const minStock = Number(product.minStock || 0);

  if (stock <= 0) return 'agotado';

  if (stock <= minStock) return 'bajo_stock';

  if (product.expirationDate) {
    const now = new Date();
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    const expirationDate = new Date(product.expirationDate);

    if (expirationDate >= now && expirationDate <= limit) {
      return 'proximo_vencer';
    }
  }

  return 'disponible';
};

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre del producto es obligatorio'],
      trim: true
    },
    category: {
      type: String,
      required: [true, 'La categoria es obligatoria'],
      trim: true
    },
    sku: {
      type: String,
      required: [true, 'El SKU es obligatorio'],
      unique: true,
      uppercase: true,
      trim: true
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    minStock: {
      type: Number,
      required: true,
      min: 0,
      default: 10
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0
    },
    salePrice: {
      type: Number,
      required: true,
      min: 0
    },
    expirationDate: {
      type: Date
    },
    status: {
      type: String,
      enum: PRODUCT_STATUSES,
      default: 'disponible'
    },
    isDemo: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

productSchema.methods.updateInventoryStatus = function updateInventoryStatus() {
  this.status = calculateProductStatus(this);
  return this.status;
};

productSchema.methods.refreshInventoryStatus = async function refreshInventoryStatus(session) {
  this.updateInventoryStatus();
  return this.save({ session });
};

productSchema.statics.calculateProductStatus = calculateProductStatus;

productSchema.pre('validate', function setStatus(next) {
  this.updateInventoryStatus();
  next();
});

module.exports = mongoose.model('Product', productSchema);
