const dns = require('dns');
const mongoose = require('mongoose');

const DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];

const maskMongoUri = (mongoUri) => {
  try {
    const parsed = new URL(mongoUri);
    if (parsed.username) parsed.username = '***';
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch (error) {
    return 'URI detectada, pero no se pudo mostrar de forma segura';
  }
};

const getConnectionHelp = (error) => {
  const message = `${error.name || ''} ${error.code || ''} ${error.message || ''}`.toLowerCase();

  if (message.includes('querysrv') || message.includes('econnrefused')) {
    return 'Diagnostico: Node.js no puede resolver el registro DNS SRV de MongoDB Atlas. Revise DNS, firewall o pruebe npm run test:mongo.';
  }

  if (message.includes('enotfound')) {
    return 'Diagnostico: dominio o nombre de cluster incorrecto en MONGO_URI.';
  }

  if (
    message.includes('mongoservererror') ||
    message.includes('bad auth') ||
    message.includes('authentication failed') ||
    message.includes('auth failed')
  ) {
    return 'Diagnostico: usuario o contrasena incorrectos en Database Access de MongoDB Atlas.';
  }

  if (message.includes('whitelist') || message.includes('not authorized') || message.includes('ip address')) {
    return 'Diagnostico: posible IP no autorizada. Revise Network Access e IP Access List en MongoDB Atlas.';
  }

  if (message.includes('timeout') || message.includes('etimedout') || message.includes('server selection timed out')) {
    return 'Diagnostico: timeout de red. Revise firewall, red corporativa/VPN o salida al puerto 27017.';
  }

  return 'Diagnostico: revise MONGO_URI, estado del cluster Atlas y conectividad de red.';
};

const connectDB = async () => {
  try {
    dns.setServers(DNS_SERVERS);

    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error('MONGO_URI no esta configurado');
    }

    if (!mongoUri.startsWith('mongodb+srv://') && !mongoUri.startsWith('mongodb://')) {
      throw new Error('MONGO_URI debe iniciar con mongodb+srv:// o mongodb://');
    }

    console.log(`MONGO_URI detectada: ${maskMongoUri(mongoUri)}`);
    console.log(`DNS configurados para Node.js: ${DNS_SERVERS.join(', ')}`);

    const connection = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10
    });

    console.log(`MongoDB conectado correctamente a host: ${connection.connection.host}`);
  } catch (error) {
    console.error('Error conectando a MongoDB:', error.message);
    console.error(getConnectionHelp(error));
    process.exit(1);
  }
};

module.exports = connectDB;
module.exports.getConnectionHelp = getConnectionHelp;
module.exports.maskMongoUri = maskMongoUri;
