const r=require('express').Router();
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');
const c=require('./controller');
r.get('/',permit(P.VIEW_AUDIT_LOGS),c.list);
module.exports=r;
