const mongoose = require('mongoose');

const calculateSupplierStatus = (supplier) => {
  const currentDebt = Number(supplier.currentDebt || 0);
  const creditLimit = Number(supplier.creditLimit || 0);

  if (currentDebt <= 0) return 'activo';
  if (creditLimit <= 0) return 'bloqueado';
  if (currentDebt > creditLimit) return 'bloqueado';
  if (currentDebt >= creditLimit * 0.8) return 'riesgo';
  return 'activo';
};

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    document: { type: String, required: true, unique: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    contactName: { type: String, trim: true },
    city: { type: String, trim: true },
    address: { type: String, trim: true },
    creditLimit: { type: Number, min: 0, default: 0 },
    currentDebt: { type: Number, min: 0, default: 0 },
    paymentTermDays: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['activo', 'riesgo', 'bloqueado'], default: 'activo' },
    isDemo: { type: Boolean, default: false }
  },
  { timestamps: true }
);

supplierSchema.methods.updatePayableStatus = function updatePayableStatus() {
  this.status = calculateSupplierStatus(this);
  return this.status;
};

supplierSchema.pre('validate', function setStatus(next) {
  this.updatePayableStatus();
  next();
});

module.exports = mongoose.model('Supplier', supplierSchema);
