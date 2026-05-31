require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`DulceERP API escuchando en puerto ${PORT}`);
    console.log(`URL local: http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`El puerto ${PORT} ya esta en uso. Deten el proceso anterior o cambia PORT en .env.`);
      process.exit(1);
    }

    console.error('Error iniciando servidor:', error.message);
    process.exit(1);
  });
};

startServer().catch((error) => {
  console.error('No fue posible iniciar DulceERP API:', error.message);
  process.exit(1);
});
