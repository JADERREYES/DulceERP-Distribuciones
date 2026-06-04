const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth.routes');
const auditRoutes = require('./routes/audit.routes');
const batchRoutes = require('./routes/productBatch.routes');
const customerRoutes = require('./routes/customer.routes');
const dataCleanupRoutes = require('./routes/dataCleanup.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const expenseRoutes = require('./routes/expense.routes');
const executiveReportRoutes = require('./routes/executiveReport.routes');
const paymentRoutes = require('./routes/payment.routes');
const productRoutes = require('./routes/product.routes');
const purchaseRoutes = require('./routes/purchase.routes');
const reportRoutes = require('./routes/report.routes');
const reconciliationRoutes = require('./routes/reconciliation.routes');
const saleRoutes = require('./routes/sale.routes');
const searchRoutes = require('./routes/search.routes');
const supplierPaymentRoutes = require('./routes/supplierPayment.routes');
const supplierRoutes = require('./routes/supplier.routes');
const kardexRoutes = require('./routes/kardex.routes');
const wasteRoutes = require('./routes/waste.routes');
const userRoutes = require('./routes/user.routes');
const { isExpiredLotSaleTestModeEnabled } = require('./utils/testMode');

const app = express();

const dbStates = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'DulceERP API funcionando',
    docs: '/api/health'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'DulceERP API',
    database: dbStates[mongoose.connection.readyState] || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    allowExpiredLotSalesForTest: isExpiredLotSaleTestModeEnabled(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/data-cleanup', dataCleanupRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/supplier-payments', supplierPaymentRoutes);
app.use('/api/kardex', kardexRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/wastes', wasteRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/executive-reports', executiveReportRoutes);
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/search', searchRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada.' });
});

module.exports = app;
