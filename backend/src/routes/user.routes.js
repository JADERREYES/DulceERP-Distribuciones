const express = require('express');
const {
  createUser,
  deleteUser,
  getUserById,
  getUsers,
  updateUser,
  updateUserPassword,
  updateUserStatus
} = require('../controllers/user.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin'));
router.route('/').get(getUsers).post(createUser);
router.patch('/:id/status', updateUserStatus);
router.patch('/:id/password', updateUserPassword);
router.route('/:id').get(getUserById).put(updateUser).delete(deleteUser);

module.exports = router;
