const AuditLog = require('../models/AuditLog');

const createAuditLog = async ({ req, action, module, entityId, entityType, description, before, after, metadata }) => {
  try {
    const user = req?.user;

    await AuditLog.create({
      user: user?._id,
      userName: user?.name,
      userEmail: user?.email,
      userRole: user?.role,
      action,
      module,
      entityId: entityId?.toString(),
      entityType,
      description,
      before,
      after,
      metadata,
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent']
    });
  } catch (error) {
    console.warn('No fue posible registrar audit log:', error.message);
  }
};

module.exports = { createAuditLog };
