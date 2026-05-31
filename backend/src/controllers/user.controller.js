const User = require('../models/User');
const { createAuditLog } = require('../utils/auditLogger');
const { paginatedResponse } = require('../utils/pagination');

const userSelect = '-password';
const roles = ['admin', 'contador', 'vendedor', 'bodega', 'cartera', 'repartidor'];
const statuses = ['activo', 'inactivo', 'bloqueado'];

const sanitizeUser = (user) => ({
  id: user._id,
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status || 'activo',
  lastLogin: user.lastLogin,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const ensureActiveAdminRemains = async (targetUserId = null, nextStatus = null, nextRole = null) => {
  const activeAdmins = await User.find({ role: 'admin', status: 'activo' }).select('_id role status');
  const remaining = activeAdmins.filter((admin) => {
    if (targetUserId && admin._id.toString() === targetUserId.toString()) {
      if (nextRole && nextRole !== 'admin') return false;
      if (nextStatus && nextStatus !== 'activo') return false;
      return false;
    }
    return true;
  });

  if (remaining.length === 0) {
    const targetIsOnlyActiveAdmin = activeAdmins.some((admin) => admin._id.toString() === targetUserId?.toString());
    if (targetIsOnlyActiveAdmin) {
      const error = new Error('Debe existir al menos un admin activo.');
      error.statusCode = 400;
      throw error;
    }
  }
};

const getUsers = async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { email: regex }, { role: regex }];
    }

    const response = await paginatedResponse(User, {
      filter,
      query: req.query,
      sortDefault: { createdAt: -1 }
    });
    response.data = response.data.map(sanitizeUser);
    return res.json(response);
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando usuarios.', error: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { name, email, password, role = 'vendedor', status = 'activo' } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Nombre, email y contrasena son obligatorios.' });
    if (!roles.includes(role)) return res.status(400).json({ message: 'Rol invalido.' });
    if (!statuses.includes(status)) return res.status(400).json({ message: 'Estado invalido.' });
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'Ya existe un usuario con ese email.' });

    const user = await User.create({ name, email, password, role, status });
    await createAuditLog({ req, action: 'CREATE', module: 'auth', entityId: user._id, entityType: 'User', description: `Usuario creado: ${user.email}`, after: sanitizeUser(user) });
    return res.status(201).json(sanitizeUser(user));
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error creando usuario.', error: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(userSelect);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    return res.json(sanitizeUser(user));
  } catch (error) {
    return res.status(400).json({ message: 'Error consultando usuario.', error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { name, email, role, status } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

    const before = sanitizeUser(user);
    if (email && email !== user.email) {
      const exists = await User.findOne({ email, _id: { $ne: user._id } });
      if (exists) return res.status(409).json({ message: 'Ya existe un usuario con ese email.' });
      user.email = email;
    }
    if (name) user.name = name;
    if (role) {
      if (!roles.includes(role)) return res.status(400).json({ message: 'Rol invalido.' });
      await ensureActiveAdminRemains(user._id, status || user.status, role);
      user.role = role;
    }
    if (status) {
      if (!statuses.includes(status)) return res.status(400).json({ message: 'Estado invalido.' });
      if (req.user._id.toString() === user._id.toString() && status !== 'activo') return res.status(400).json({ message: 'No puedes bloquear o desactivar tu propio usuario.' });
      await ensureActiveAdminRemains(user._id, status, role || user.role);
      user.status = status;
    }

    await user.save();
    await createAuditLog({ req, action: 'UPDATE', module: 'auth', entityId: user._id, entityType: 'User', description: `Usuario actualizado: ${user.email}`, before, after: sanitizeUser(user) });
    return res.json(sanitizeUser(user));
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error actualizando usuario.', error: error.message });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!statuses.includes(status)) return res.status(400).json({ message: 'Estado invalido.' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    if (req.user._id.toString() === user._id.toString() && status !== 'activo') return res.status(400).json({ message: 'No puedes bloquear o desactivar tu propio usuario.' });
    await ensureActiveAdminRemains(user._id, status, user.role);

    const before = sanitizeUser(user);
    user.status = status;
    await user.save();
    await createAuditLog({ req, action: 'STATUS_CHANGE', module: 'auth', entityId: user._id, entityType: 'User', description: `Estado de usuario cambiado a ${status}`, before, after: sanitizeUser(user) });
    return res.json(sanitizeUser(user));
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error cambiando estado de usuario.', error: error.message });
  }
};

const updateUserPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ message: 'La contrasena debe tener al menos 6 caracteres.' });
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

    user.password = password;
    await user.save();
    await createAuditLog({ req, action: 'UPDATE', module: 'auth', entityId: user._id, entityType: 'User', description: `Contrasena de usuario actualizada: ${user.email}`, metadata: { passwordChanged: true } });
    return res.json({ message: 'Contrasena actualizada correctamente.' });
  } catch (error) {
    return res.status(400).json({ message: 'Error cambiando contrasena.', error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    if (req.user._id.toString() === user._id.toString()) return res.status(400).json({ message: 'No puedes eliminar tu propio usuario.' });
    await ensureActiveAdminRemains(user._id, 'inactivo', user.role);

    const before = sanitizeUser(user);
    await User.deleteOne({ _id: user._id });
    await createAuditLog({ req, action: 'DELETE', module: 'auth', entityId: user._id, entityType: 'User', description: `Usuario eliminado: ${user.email}`, before });
    return res.json({ message: 'Usuario eliminado correctamente.' });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: 'Error eliminando usuario.', error: error.message });
  }
};

module.exports = { createUser, deleteUser, getUserById, getUsers, updateUser, updateUserPassword, updateUserStatus };
