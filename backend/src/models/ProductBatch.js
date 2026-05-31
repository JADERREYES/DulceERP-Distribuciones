const mongoose = require('mongoose');
const { updateBatchStatus } = require('../utils/batchStatus');

const productBatchSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    batchNumber: { type: String, required: true, trim: true },
    initialQuantity: { type: Number, required: true, min: 0.01 },
    availableQuantity: { type: Number, required: true, min: 0, default: 0 },
    unitCost: { type: Number, required: true, min: 0.01 },
    expirationDate: { type: Date, required: true },
    receivedDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['disponible', 'bajo_stock', 'proximo_vencer', 'vencido', 'agotado'],
      default: 'disponible'
    },
    notes: { type: String, trim: true },
    isDemo: { type: Boolean, default: false }
  },
  { timestamps: true }
);

productBatchSchema.index({ product: 1, batchNumber: 1 }, { unique: true });

productBatchSchema.methods.updateStatus = function updateStatus() {
  return updateBatchStatus(this);
};

productBatchSchema.pre('validate', function setStatus(next) {
  updateBatchStatus(this);
  next();
});

module.exports = mongoose.model('ProductBatch', productBatchSchema);
