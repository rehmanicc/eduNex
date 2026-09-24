const r = require('express').Router();
const controller = require('./controller');
const P = require('../../constants/permissions');

function canView(req,res,next){
  if(req.user?.systemRole==='platform_owner')return next();
  const perms=new Set(req.user?.effectivePermissions||[]);
  if(perms.has('*')||perms.has(P.VIEW_EMPLOYEES)||perms.has(P.MANAGE_EMPLOYEES)||perms.has(P.MANAGE_COLLEGE))return next();
  return res.status(403).json({error:'Designation access denied'});
}
function canManage(req,res,next){
  if(req.user?.systemRole==='platform_owner')return next();
  const perms=new Set(req.user?.effectivePermissions||[]);
  const roles=new Set(req.user?.roleCodes||[]);
  if(perms.has('*')||perms.has(P.MANAGE_EMPLOYEES)||perms.has(P.MANAGE_COLLEGE)||roles.has('director')||roles.has('admin'))return next();
  return res.status(403).json({error:'Designation management permission denied'});
}

r.get('/', canView, controller.list);
r.post('/', canManage, controller.create);
r.put('/:id', canManage, controller.update);
module.exports = r;
