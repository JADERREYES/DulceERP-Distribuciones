require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const seed = async () => {
  try {
    await connectDB();

    const existingAdmin = await User.findOne({ email: 'admin@dulceerp.com' });
    if (!existingAdmin) {
      await User.create({
        name: 'Administrador DulceERP',
        email: 'admin@dulceerp.com',
        password: 'Admin12345',
        role: 'admin'
      });
      console.log('Usuario administrador creado');
    } else {
      console.log('Usuario administrador ya existe');
    }

    console.log('Seed ejecutado: solo usuario administrador. No se crearon datos demo.');
    await mongoose.disconnect();
    console.log('Conexion MongoDB cerrada');
    process.exit(0);
  } catch (error) {
    console.error('Error ejecutando seed:', error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Conexion MongoDB cerrada');
    }
    process.exit(1);
  }
};

seed();
