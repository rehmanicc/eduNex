const {toId}=require('../utils/normalize');

module.exports=function tenant(req,res,next){
  req.isPlatformOwner=req.user?.systemRole==='platform_owner';
  req.collegeId=req.isPlatformOwner?(req.query.collegeId||req.body?.collegeId||null):req.user?.collegeId;

  req.tenantFilter=(extra={})=>{
    if(req.isPlatformOwner)return req.collegeId?{collegeId:req.collegeId,...extra}:extra;
    if(!req.collegeId)throw Object.assign(new Error('Tenant context missing'),{status:403});
    return{collegeId:req.collegeId,...extra};
  };

  req.assertTenant=(collegeId)=>{
    if(!req.isPlatformOwner&&toId(collegeId)!==toId(req.user.collegeId))
      throw Object.assign(new Error('Cross-tenant access denied'),{status:403});
  };

  const roleCodes=new Set(req.user?.roleCodes||[]);
  const isDirector=roleCodes.has('director');
  const isPrincipal=roleCodes.has('principal');
  const configuredMode=req.user?.branchAccess?.mode||'selected';
  const configuredBranchIds=(req.user?.branchAccess?.branchIds||[]).map(toId).filter(Boolean);

  // Platform Owner and Director are institution-wide. For backward compatibility,
  // non-principal roles keep institution-wide access until their own branch rules are added.
  req.hasAllBranchAccess=Boolean(req.isPlatformOwner||isDirector||!isPrincipal||configuredMode==='all');
  req.allowedBranchIds=req.hasAllBranchAccess?null:configuredBranchIds;

  req.branchFilter=(extra={},branchField='branchId')=>{
    const base=req.tenantFilter(extra);
    if(req.hasAllBranchAccess)return base;
    return{...base,[branchField]:{$in:req.allowedBranchIds||[]}};
  };

  req.assertBranch=(branchId)=>{
    if(req.hasAllBranchAccess)return true;
    const id=toId(branchId);
    if(!id||!(req.allowedBranchIds||[]).includes(id))
      throw Object.assign(new Error('You do not have access to this branch'),{status:403});
    return true;
  };

  next();
};
