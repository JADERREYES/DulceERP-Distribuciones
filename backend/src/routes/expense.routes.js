const express = require('express');
const {
  createExpense,
  deleteExpense,
  getExpenseById,
  getExpenses,
  updateExpense
} = require('../controllers/expense.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect);
router.route('/').get(authorizeRoles('admin', 'contador'), getExpenses).post(authorizeRoles('admin', 'contador'), createExpense);
router
  .route('/:id')
  .get(authorizeRoles('admin', 'contador'), getExpenseById)
  .put(authorizeRoles('admin', 'contador'), updateExpense)
  .delete(authorizeRoles('admin'), deleteExpense);

module.exports = router;
