const r=require('express').Router();
const c=require('./controller');
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');

r.get('/branch-options',permit(P.MANAGE_USERS),c.branchOptions);
r.get('/',permit(P.MANAGE_USERS),c.list);
r.post('/',permit(P.MANAGE_USERS),c.create);
r.put('/:id',permit(P.MANAGE_USERS),c.update);
r.put('/:id/branch-access',permit(P.MANAGE_USERS),c.updateBranchAccess);
r.post('/:id/reset-password',permit(P.MANAGE_USERS),c.resetPassword);
module.exports=r;
