require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { buildRealReadinessReport } = require('../utils/realDataReadiness');

const main = async () => {
  await connectDB();
  const report = await buildRealReadinessReport();

  console.log('AUDITORIA READ-ONLY PREPARACION DATOS REALES');
  console.log(`Fecha: ${report.generatedAt}`);
  console.log('Modo: SOLO LECTURA. No se borran ni modifican datos.');

  console.log('\nConteo por coleccion:');
  Object.entries(report.collectionsCount).forEach(([collection, count]) => console.log(`- ${collection}: ${count}`));

  console.log('\nDatos marcados isDemo=true:');
  Object.entries(report.demoMarked).forEach(([collection, count]) => console.log(`- ${collection}: ${count}`));

  console.log('\nResumen demo y riesgos:');
  console.log(`- Posibles demo por patron: ${report.possibleDemo.summary?.totalPossibleDemoRecords || 0}`);
  console.log(`- Registros riesgosos: ${report.riskyRecords.length}`);
  console.log(`- Registros bloqueados: ${report.blockedRecords.length}`);
  console.log(`- Admin activos: ${report.users.activeAdminCount}`);

  console.log('\nInventario:');
  console.log(`- Lotes vencidos con stock: ${report.inventory.expiredBatchesWithStock.length}`);
  console.log(`- Diferencias stock/lotes: ${report.inventory.stockVsBatches.length}`);
  console.log(`- Productos con stock negativo: ${report.inventory.productsNegativeStock.length}`);
  console.log(`- Diagnostico FEFO productos: ${report.inventory.fefoReadiness.length}`);

  console.log('\nFinanciero:');
  console.log(`- Clientes con deuda: ${report.financial.customersWithDebt.length}`);
  console.log(`- Proveedores con deuda: ${report.financial.suppliersWithDebt.length}`);
  console.log(`- Clientes con deuda negativa: ${report.financial.customersNegativeDebt.length}`);
  console.log(`- Proveedores con deuda negativa: ${report.financial.suppliersNegativeDebt.length}`);

  console.log('\nRiesgos de limpieza:');
  Object.entries(report.risks).forEach(([risk, value]) => console.log(`- ${risk}: ${value ? 'SI' : 'NO'}`));

  if (report.inventory.fefoReadiness.length > 0) {
    console.log('\nDiagnostico FEFO por producto:');
    report.inventory.fefoReadiness.forEach((row) => console.log(JSON.stringify(row)));
  }

  console.log('\nRecomendaciones:');
  report.recommendations.forEach((recommendation) => console.log(`- ${recommendation}`));

  await mongoose.disconnect();
  console.log('\nConexion MongoDB cerrada');
};

main().catch(async (error) => {
  console.error('Error ejecutando auditoria de preparacion real:', error.message);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('Conexion MongoDB cerrada');
  }
  process.exit(1);
});
