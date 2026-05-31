const express = require('express');
const {
  auditSummary,
  incomeStatement,
  inventoryValuation,
  payables,
  receivables,
  summary,
  wastes
} = require('../controllers/executiveReport.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin', 'contador'));
router.get('/summary', summary);
router.get('/income-statement', incomeStatement);
router.get('/inventory-valuation', inventoryValuation);
router.get('/receivables', receivables);
router.get('/payables', payables);
router.get('/wastes', wastes);
router.get('/audit-summary', auditSummary);

module.exports = router;
