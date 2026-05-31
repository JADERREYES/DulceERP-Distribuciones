const mongoose = require('mongoose');

const costHistorySchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    previousCost: { type: Number, min: 0, default: 0 },
    newCost: { type: Number, required: true, min: 0 },
    changeType: { type: String, enum: ['purchase_average_cost', 'purchase_cancel_note', 'manual_adjustment'], default: 'purchase_average_cost' },
    quantity: { type: Number, min: 0, default: 0 },
    note: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CostHistory', costHistorySchema);
