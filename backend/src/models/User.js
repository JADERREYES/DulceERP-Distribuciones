const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'El email es obligatorio'],
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, 'La contrasena es obligatoria'],
      minlength: 6,
      select: false
    },
    role: {
      type: String,
      enum: ['admin', 'contador', 'vendedor', 'bodega', 'repartidor', 'cartera'],
      default: 'vendedor'
    },
    status: {
      type: String,
      enum: ['activo', 'inactivo', 'bloqueado'],
      default: 'activo'
    },
    lastLogin: {
      type: Date
    }
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function matchPassword(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
