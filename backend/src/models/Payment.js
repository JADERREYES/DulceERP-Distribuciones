const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    paymentMethod: {
      type: String,
      enum: ['efectivo', 'transferencia', 'tarjeta', 'otro'],
      required: true
    },
    note: {
      type: String,
      trim: true
    },
    appliedToSales: [
      {
        sale: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Sale',
          required: true
        },
        amountApplied: {
          type: Number,
          required: true,
          min: 0.01
        }
      }
    ],
    isDemo: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
