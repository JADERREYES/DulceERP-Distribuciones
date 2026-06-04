const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0.01
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0.01
    },
    costSubtotal: {
      type: Number,
      required: true,
      min: 0
    },
    batches: [
      {
        batch: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductBatch', required: true },
        batchNumber: { type: String, required: true },
        quantity: { type: Number, required: true, min: 0.01 },
        expirationDate: { type: Date, required: true }
      }
    ]
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    items: {
      type: [saleItemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: 'La venta debe tener al menos un producto'
      }
    },
    total: {
      type: Number,
      required: true,
      min: 0.01
    },
    totalCost: {
      type: Number,
      required: true,
      min: 0
    },
    grossProfit: {
      type: Number,
      required: true
    },
    paymentMethod: {
      type: String,
      enum: ['contado', 'credito'],
      required: true
    },
    paymentStatus: {
      type: String,
      enum: ['pagado', 'pendiente'],
      default: 'pagado'
    },
    paidAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    balance: {
      type: Number,
      min: 0,
      default: 0
    },
    routeZone: {
      type: String,
      required: true,
      trim: true
    },
    note: {
      type: String,
      trim: true
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['activa', 'anulada'],
      default: 'activa'
    },
    testMode: {
      type: Boolean,
      default: false
    },
    bypassFefo: {
      type: Boolean,
      default: false
    },
    bypassReason: {
      type: String,
      default: ''
    },
    isDemo: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

saleSchema.pre('validate', function normalizeLegacyValues(next) {
  if (['efectivo', 'transferencia'].includes(this.paymentMethod)) {
    this.paymentMethod = 'contado';
  }

  if (this.paymentStatus === 'parcial') {
    this.paymentStatus = 'pendiente';
  }

  if (!this.status) {
    this.status = 'activa';
  }

  if (this.isNew || this.isModified('total') || this.isModified('paymentMethod') || this.isModified('paymentStatus')) {
    if (this.paymentMethod === 'contado') {
      this.paidAmount = Number(this.total || 0);
      this.balance = 0;
      this.paymentStatus = 'pagado';
    } else if (this.paymentMethod === 'credito' && (this.paidAmount === undefined || this.balance === undefined)) {
      this.paidAmount = 0;
      this.balance = Number(this.total || 0);
      this.paymentStatus = 'pendiente';
    }
  }

  next();
});

module.exports = mongoose.model('Sale', saleSchema);
