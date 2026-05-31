const mongoose = require('mongoose');

const calculateCustomerStatus = (customer) => {
  const currentDebt = Number(customer.currentDebt || 0);
  const creditLimit = Number(customer.creditLimit || 0);

  if (currentDebt <= 0) return 'activo';
  if (creditLimit <= 0) return 'bloqueado';
  if (currentDebt > creditLimit) return 'bloqueado';
  if (currentDebt >= creditLimit * 0.8) return 'riesgo';
  return 'activo';
};

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre del cliente es obligatorio'],
      trim: true
    },
    document: {
      type: String,
      required: [true, 'El documento es obligatorio'],
      unique: true,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['tienda', 'minimercado', 'colegio', 'institucional', 'cafeteria', 'mayorista'],
      required: true
    },
    zone: {
      type: String,
      required: [true, 'La zona es obligatoria'],
      trim: true
    },
    creditLimit: {
      type: Number,
      min: 0,
      default: 0
    },
    currentDebt: {
      type: Number,
      min: 0,
      default: 0
    },
    paymentTermDays: {
      type: Number,
      min: 0,
      default: 0
    },
    status: {
      type: String,
      enum: ['activo', 'riesgo', 'bloqueado'],
      default: 'activo'
    },
    isDemo: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

customerSchema.methods.updateCreditStatus = function updateCreditStatus() {
  this.status = calculateCustomerStatus(this);
  return this.status;
};

customerSchema.methods.refreshCreditStatus = async function refreshCreditStatus(session) {
  this.updateCreditStatus();
  return this.save({ session });
};

customerSchema.statics.calculateCustomerStatus = calculateCustomerStatus;

customerSchema.pre('validate', function setStatus(next) {
  this.updateCreditStatus();
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
