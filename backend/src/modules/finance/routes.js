const r=require('express').Router();
const P=require('../../constants/permissions');
const c=require('./controller');

function any(...permissions){return (req,res,next)=>{if(req.user?.systemRole==='platform_owner')return next();const owned=new Set(req.user?.effectivePermissions||req.user?.permissions||[]);if(owned.has('*')||permissions.some(p=>owned.has(p)))return next();return res.status(403).json({error:'Permission denied',requiredAny:permissions});};}
const view=any(P.VIEW_FINANCE,P.VIEW_FINANCE_REPORTS,P.MANAGE_FINANCE,P.MANAGE_EXPENSES);
const manage=any(P.MANAGE_FINANCE,P.CREATE_FINANCE_TRANSACTION,P.MANAGE_EXPENSES);
const approve=any(P.APPROVE_FINANCE_TRANSACTION,P.MANAGE_FINANCE);
const post=any(P.POST_FINANCE_TRANSACTION,P.MANAGE_FINANCE);
const reverse=any(P.REVERSE_FINANCE_TRANSACTION,P.MANAGE_FINANCE);
const setup=any(P.MANAGE_FINANCE_ACCOUNTS,P.MANAGE_FINANCE_HEADS,P.MANAGE_FINANCE,P.MANAGE_EXPENSES);

r.post('/setup',setup,c.setup);
r.get('/dashboard',view,c.dashboard);
r.get('/accounts',view,c.listAccounts);
r.post('/accounts',setup,c.createAccount);
r.put('/accounts/:id',setup,c.updateAccount);
r.get('/accounts/:id/ledger',view,c.accountLedger);
r.get('/heads',view,c.listHeads);
r.post('/heads',setup,c.createHead);
r.put('/heads/:id',setup,c.updateHead);
r.get('/income',view,c.listIncome);
r.get('/expenses',view,c.listExpenses);
r.get('/transactions',view,c.listTransactions);
r.post('/transactions',manage,c.createTransaction);
r.put('/transactions/:id',manage,c.updateTransaction);
r.post('/transactions/:id/submit',manage,c.submitTransaction);
r.post('/transactions/:id/approve',approve,c.approveTransaction);
r.post('/transactions/:id/post',post,c.postTransaction);
r.post('/transactions/:id/reverse',reverse,c.reverseTransaction);
r.get('/reports/summary',view,c.reportSummary);

module.exports=r;
