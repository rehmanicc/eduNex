const r = require('express').Router();
const c = require('./controller');
const permit = require('../../middleware/permissions');
const P = require('../../constants/permissions');
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Director always has Fee Structure revision authority. Any other college user
// must receive the explicit MANAGE_FEE_STRUCTURE permission (directly or via role).
const canReviseFeeStructure = (req, res, next) => {
  if (req.user?.systemRole === 'platform_owner') return next();
  const roles = new Set((req.user?.roleCodes || []).map(code => String(code).toLowerCase()));
  const permissions = new Set(req.user?.effectivePermissions || []);
  if (roles.has('director') || permissions.has('*') || permissions.has(P.MANAGE_FEE_STRUCTURE)) return next();
  return res.status(403).json({ error: 'Permission denied', required: [P.MANAGE_FEE_STRUCTURE] });
};

// Existing finance routes retained for backward compatibility.
r.get('/packages', permit(P.VIEW_FEES), asyncHandler(c.listPackages));
r.post('/packages', permit(P.MANAGE_FEES), asyncHandler(c.createPackage));
r.put('/packages/:id', permit(P.MANAGE_FEES), asyncHandler(c.updatePackage));
r.delete('/packages/:id', permit(P.MANAGE_FEES), asyncHandler(c.deletePackage));
r.post('/packages/:id/lock', permit(P.LOCK_FEE_PACKAGE), asyncHandler(c.lockPackage));
r.get('/packages/:id/history', permit(P.VIEW_FEES), asyncHandler(c.packageHistory));
r.post('/admissions/:admissionId/assign-package', permit(P.MANAGE_FEES), asyncHandler(c.assignPackage));
r.put('/student-plans/:id/installments', permit(P.MANAGE_FEES), asyncHandler(c.updateInstallments));
r.get('/admissions/:admissionId/ledger', permit(P.VIEW_FEES), asyncHandler(c.getAdmissionLedger));
r.post('/student-plans/:planId/payments', permit(P.POST_FEE_PAYMENTS), asyncHandler(c.postPayment));

// v3.29: fixed system Fee Heads. There is intentionally no Fee Head CRUD.
r.get('/system-heads', permit(P.VIEW_FEES), asyncHandler(c.listSystemFeeHeads));

// Default Tuition installment schedules by Session + Program / Class.
r.get('/default-installments', permit(P.VIEW_FEES), asyncHandler(c.listDefaultInstallments));
r.put('/default-installments', permit(P.MANAGE_FEES), asyncHandler(c.saveDefaultInstallments));

// Fee Structures: standard amount per system Fee Head for one or more Classes / Programs.
r.get('/structures', permit(P.VIEW_FEES), asyncHandler(c.listFeeStructures));
r.post('/structures', permit(P.MANAGE_FEES), asyncHandler(c.createFeeStructure));
r.put('/structures/:id/revise', canReviseFeeStructure, asyncHandler(c.reviseFeeStructure));
r.post('/structures/:id/approve', permit(P.MANAGE_FEES), asyncHandler(c.approveFeeStructure));
r.post('/structures/:id/reject', permit(P.MANAGE_FEES), asyncHandler(c.rejectFeeStructure));

// Student Fee Package: approved structure copied to student, then per-head concession may differ.
r.get('/student-packages', permit(P.VIEW_FEES), asyncHandler(c.listStudentFeePackages));
r.get('/admissions/:admissionId/applicable-structures', permit(P.VIEW_FEES), asyncHandler(c.getApplicableFeeStructures));
r.post('/admissions/:admissionId/student-package', permit(P.MANAGE_FEES), asyncHandler(c.assignStudentFeePackage));


// v3.31 Fee Posting: scheduled installment/monthly charge + additional heads + fee-head aware receipts.
r.get('/posting/students', permit(P.VIEW_FEES), asyncHandler(c.getFeePostingStudents));
r.get('/student-plans/:planId/posting-summary', permit(P.VIEW_FEES), asyncHandler(c.getPostingSummary));
r.post('/student-plans/:planId/eligible-voucher-heads', permit(P.VIEW_FEES), asyncHandler(c.getEligibleVoucherHeads));
r.post('/student-plans/:planId/postings', permit(P.MANAGE_FEES), asyncHandler(c.createFeePosting));
r.post('/posting/bulk', permit(P.MANAGE_FEES), asyncHandler(c.createBulkFeePostings));
r.get('/posting/vouchers', permit(P.VIEW_FEES), asyncHandler(c.listFeeVouchers));
r.get('/posting/vouchers/:id', permit(P.VIEW_FEES), asyncHandler(c.getFeeVoucher));
r.post('/student-plans/:planId/allocated-payments', permit(P.POST_FEE_PAYMENTS), asyncHandler(c.postAllocatedPayment));
r.get('/reports/:type', permit(P.VIEW_FEES), asyncHandler(c.getFeeReport));

module.exports = r;
