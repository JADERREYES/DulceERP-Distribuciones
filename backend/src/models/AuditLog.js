const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    userName: String,
    userEmail: String,
    userRole: String,
    action: {
      type: String,
      required: true,
      enum: ['CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'PAYMENT', 'LOGIN', 'LOGOUT', 'READ', 'STOCK_DECREASE', 'STOCK_INCREASE', 'STATUS_CHANGE', 'TEST_BYPASS_FEFO_SALE']
    },
    module: {
      type: String,
      required: true,
      enum: ['auth', 'products', 'customers', 'sales', 'payments', 'expenses', 'dashboard', 'reports', 'suppliers', 'purchases', 'supplierPayments', 'kardex', 'reconciliation', 'batches', 'wastes', 'dataCleanup']
    },
    entityId: String,
    entityType: String,
    description: String,
    before: Object,
    after: Object,
    metadata: Object,
    ipAddress: String,
    userAgent: String
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
