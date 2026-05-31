require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const app = require('../app');

const routes = [
  'GET /',
  'GET /api/health',
  'GET /api/auth/profile',
  'GET /api/products',
  'GET /api/customers',
  'GET /api/sales',
  'GET /api/payments',
  'GET /api/reports/receivables',
  'GET /api/executive-reports/summary',
  'GET /api/reconciliation/financial',
  'GET /api/audit-logs'
];

const checkApi = async () => {
  await connectDB();

  console.log('MongoDB disponible para API.');
  console.log(`Base de datos: ${mongoose.connection.name}`);
  console.log('Rutas principales no destructivas para validar manualmente:');
  routes.forEach((route) => console.log(`- ${route}`));
  console.log('Para probar health con servidor encendido:');
  console.log('curl http://localhost:5000/api/health');
  console.log('Invoke-RestMethod http://localhost:5000/api/health');
  console.log('Los endpoints protegidos requieren token Bearer de un usuario autorizado.');

  if (app) {
    console.log('Express app cargada correctamente.');
  }
};

checkApi()
  .catch((error) => {
    console.error('Error validando API:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Conexion MongoDB cerrada');
    }
  });
