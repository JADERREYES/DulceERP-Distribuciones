const mongoose = require('mongoose');

const wasteSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductBatch' },
    batchNumber: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0.01 },
    reason: {
      type: String,
      enum: ['vencimiento', 'daño', 'perdida', 'rotura', 'contaminacion', 'ajuste', 'otro'],
      required: true
    },
    unitCost: { type: Number, min: 0, default: 0 },
    totalCost: { type: Number, min: 0, default: 0 },
    description: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDemo: { type: Boolean, default: false }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('Waste', wasteSchema);
