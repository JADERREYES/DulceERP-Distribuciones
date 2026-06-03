const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    concept: {
      type: String,
      required: [true, 'El concepto es obligatorio'],
      trim: true
    },
    category: {
      type: String,
      enum: [
        'administracion',
        'ventas',
        'logistica',
        'tecnologia',
        'seguridad',
        'marketing',
        'servicios',
        'nomina',
        'mantenimiento',
        'combustible'
      ],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    date: {
      type: Date,
      default: Date.now
    },
    paymentMethod: {
      type: String,
      enum: ['efectivo', 'transferencia', 'tarjeta', 'otro'],
      default: 'efectivo'
    },
    description: {
      type: String,
      trim: true
    },
    isDemo: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
