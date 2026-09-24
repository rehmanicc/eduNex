const TenantModuleConfig=require('../models/TenantModuleConfig');

module.exports=function moduleEnabled(moduleName){
  return async function(req,res,next){
    try{
      if(req.user?.systemRole==='platform_owner')return next();
      const collegeId=req.collegeId||req.user?.collegeId;
      if(!collegeId)return res.status(403).json({error:'Tenant context required'});
      const config=await TenantModuleConfig.findOne({collegeId,module:moduleName}).lean();
      if(config && config.enabled===false)return res.status(403).json({error:`${moduleName} module is disabled for this college`});
      next();
    }catch(err){next(err)}
  }
}
