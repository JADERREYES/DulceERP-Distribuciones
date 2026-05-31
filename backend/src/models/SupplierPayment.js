const mongoose = require('mongoose');

const supplierPaymentSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: { type: String, enum: ['efectivo', 'transferencia', 'tarjeta', 'otro'], required: true },
    note: { type: String, trim: true },
    appliedToPurchases: [
      {
        purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
        amountApplied: { type: Number, required: true, min: 0.01 }
      }
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDemo: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SupplierPayment', supplierPaymentSchema);
