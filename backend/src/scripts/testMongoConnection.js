require('dotenv').config();

const dns = require('dns');
const mongoose = require('mongoose');
const { checkMongoSrv } = require('../config/dnsCheck');
const { getConnectionHelp, maskMongoUri } = require('../config/db');

const DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];

const testMongoConnection = async () => {
  dns.setServers(DNS_SERVERS);

  const mongoUri = process.env.MONGO_URI;

  console.log(`Node.js: ${process.version}`);
  console.log(`DNS configurados para Node.js: ${DNS_SERVERS.join(', ')}`);
  console.log(`MONGO_URI existe: ${mongoUri ? 'si' : 'no'}`);

  if (!mongoUri) {
    throw new Error('MONGO_URI no esta configurado en .env');
  }

  if (!mongoUri.startsWith('mongodb+srv://') && !mongoUri.startsWith('mongodb://')) {
    throw new Error('MONGO_URI debe iniciar con mongodb+srv:// o mongodb://');
  }

  console.log(`MONGO_URI segura: ${maskMongoUri(mongoUri)}`);

  if (mongoUri.startsWith('mongodb+srv://')) {
    await checkMongoSrv(mongoUri);
  }

  const connection = await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
  });

  console.log('MongoDB Atlas conectado correctamente');
  console.log(`Host conectado: ${connection.connection.host}`);
  console.log(`Base de datos conectada: ${connection.connection.name}`);
};

testMongoConnection()
  .catch((error) => {
    console.error('Error probando conexion MongoDB:', error.message);
    console.error(getConnectionHelp(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Conexion MongoDB cerrada');
    }
  });
