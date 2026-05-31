const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { createAuditLog } = require('../utils/auditLogger');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });

const userResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status || 'activo'
});

const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nombre, email y contrasena son obligatorios.' });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: 'Ya existe un usuario con ese email.' });
    }

    const user = await User.create({ name, email, password, role });
    return res.status(201).json({
      user: userResponse(user),
      token: generateToken(user._id)
    });
  } catch (error) {
    return res.status(400).json({ message: 'Error registrando usuario.', error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contrasena son obligatorios.' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Credenciales invalidas.' });
    }

    if (['inactivo', 'bloqueado'].includes(user.status)) {
      return res.status(403).json({ message: 'Usuario inactivo o bloqueado. Contacta al administrador.' });
    }

    user.lastLogin = new Date();
    await user.save();

    req.user = user;
    await createAuditLog({
      req,
      action: 'LOGIN',
      module: 'auth',
      entityId: user._id,
      entityType: 'User',
      description: `Inicio de sesion exitoso: ${user.email}`
    });

    return res.json({
      user: userResponse(user),
      token: generateToken(user._id)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error iniciando sesion.', error: error.message });
  }
};

const profile = async (req, res) => {
  return res.json({ user: userResponse(req.user) });
};

module.exports = { register, login, profile };
