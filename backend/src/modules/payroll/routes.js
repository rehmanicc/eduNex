const r=require('express').Router();
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');
const c=require('./controller');

r.get('/dashboard',permit(P.VIEW_PAYROLL),c.dashboard);
r.get('/employees',permit(P.VIEW_PAYROLL),c.employeeOptions);
r.get('/salary-structures',permit(P.VIEW_PAYROLL),c.listSalaryStructures);
r.post('/salary-structures',permit(P.MANAGE_SALARY_STRUCTURES),c.createSalaryStructure);
r.get('/adjustments',permit(P.VIEW_PAYROLL),c.listAdjustments);
r.post('/adjustments',permit(P.MANAGE_PAYROLL),c.createAdjustment);
r.delete('/adjustments/:id',permit(P.MANAGE_PAYROLL),c.deleteAdjustment);
r.get('/loans',permit(P.VIEW_PAYROLL),c.listLoans);
r.post('/loans',permit(P.MANAGE_PAYROLL),c.createLoan);
r.post('/loans/:id/approve',permit(P.MANAGE_PAYROLL),c.approveLoan);
r.post('/loans/:id/reject',permit(P.MANAGE_PAYROLL),c.rejectLoan);
r.post('/loans/:id/cancel',permit(P.MANAGE_PAYROLL),c.cancelLoan);
r.post('/generate',permit(P.GENERATE_PAYROLL),c.generatePayroll);
r.get('/records',permit(P.VIEW_PAYROLL),c.listPayroll);
r.post('/records/:id/approve',permit(P.APPROVE_PAYROLL),c.approvePayroll);
r.post('/records/:id/post',permit(P.APPROVE_PAYROLL),c.approvePayroll);
r.get('/payments',permit(P.VIEW_PAYROLL),c.listPayments);
r.post('/payments',permit(P.MARK_PAYROLL_PAID),c.createPayment);
r.get('/records/:id/payslip',permit(P.VIEW_PAYROLL),c.payslip);
r.get('/settings',permit(P.VIEW_PAYROLL),c.getSettings);
r.put('/settings',permit(P.MANAGE_PAYROLL),c.saveSettings);

module.exports=r;
