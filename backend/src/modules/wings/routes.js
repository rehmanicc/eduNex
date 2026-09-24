const r = require('express').Router();
const c = require('./controller');
const P = require('../../constants/permissions');
const asyncHandler = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

function wingAccess(manage=false){return(req,res,next)=>{
  if(req.user?.systemRole==='platform_owner')return next();
  const perms=new Set(req.user?.effectivePermissions||[]);
  const roles=new Set(req.user?.roleCodes||[]);
  const ok=perms.has('*')||perms.has(P.MANAGE_COLLEGE)||(manage?perms.has(P.MANAGE_ACADEMICS):perms.has(P.VIEW_ACADEMICS))||roles.has('director')||roles.has('admin');
  if(ok)return next();
  return res.status(403).json({error:'Wings permission denied'});
};}

r.get('/structure', wingAccess(false), asyncHandler(c.structure));
r.post('/', wingAccess(true), asyncHandler(c.create));
r.put('/:id', wingAccess(true), asyncHandler(c.update));
r.put('/branches/:branchId', wingAccess(true), asyncHandler(c.setBranchWings));
module.exports = r;
