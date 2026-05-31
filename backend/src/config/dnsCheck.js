const dns = require('dns');

const extractMongoHost = (mongoUri) => {
  try {
    return new URL(mongoUri).hostname;
  } catch (error) {
    return null;
  }
};

const checkMongoSrv = async (mongoUri) => {
  if (!mongoUri || !mongoUri.startsWith('mongodb+srv://')) {
    console.log('DNS SRV: MONGO_URI no usa mongodb+srv://. No se requiere resolveSrv.');
    return [];
  }

  const host = extractMongoHost(mongoUri);
  if (!host) {
    throw new Error('No fue posible extraer el host de MONGO_URI.');
  }

  const srvRecord = `_mongodb._tcp.${host}`;

  try {
    const records = await dns.promises.resolveSrv(srvRecord);
    console.log(`DNS SRV resuelto para ${srvRecord}:`);
    records.forEach((record) => {
      console.log(`- ${record.name}:${record.port} priority=${record.priority} weight=${record.weight}`);
    });
    return records;
  } catch (error) {
    console.error(`Error resolviendo DNS SRV ${srvRecord}: ${error.code || error.name} ${error.message}`);
    throw error;
  }
};

module.exports = { checkMongoSrv };
