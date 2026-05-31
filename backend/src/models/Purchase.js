const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0.01 },
    previousUnitCost: { type: Number, min: 0, default: 0 },
    subtotal: { type: Number, required: true, min: 0.01 },
    batchNumber: { type: String, trim: true },
    expirationDate: { type: Date }
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: {
      type: [purchaseItemSchema],
      validate: { validator: (items) => items.length > 0, message: 'La compra debe tener al menos un producto' }
    },
    total: { type: Number, required: true, min: 0.01 },
    paymentMethod: { type: String, enum: ['contado', 'credito'], required: true },
    paymentStatus: { type: String, enum: ['pagado', 'pendiente'], default: 'pagado' },
    paidAmount: { type: Number, min: 0, default: 0 },
    balance: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['activa', 'anulada'], default: 'activa' },
    invoiceNumber: { type: String, trim: true },
    note: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDemo: { type: Boolean, default: false }
  },
  { timestamps: true }
);

purchaseSchema.pre('validate', function normalizeBalances(next) {
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

module.exports = mongoose.model('Purchase', purchaseSchema);
