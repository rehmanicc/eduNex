const College=require('../../models/College');
const TenantModuleConfig=require('../../models/TenantModuleConfig');
const TenantSubscription=require('../../models/TenantSubscription');
const {resolveCollegeByHost}=require('../../services/tenantResolverService');

async function resolve(req,res){
  const host=req.query.host || req.headers['x-forwarded-host'] || req.headers.host;
  let college=await resolveCollegeByHost(host);
  if(!college && process.env.NODE_ENV!=='production'){
    const localId=process.env.LOCAL_DEV_COLLEGE_ID;
    if(localId) college=await College.findOne({_id:localId,isActive:true}).lean();
    if(!college) college=await College.findOne({isActive:true}).sort({createdAt:1}).lean();
  }
  if(!college)return res.status(404).json({error:'College not found for this domain'});
  const [modules,subscription]=await Promise.all([
    TenantModuleConfig.find({collegeId:college._id,enabled:true}).select('module enabled config').lean(),
    TenantSubscription.findOne({collegeId:college._id}).populate('planId','name code enabledModules allowCustomDomain allowBiometric').lean()
  ]);
  res.json({
    college:{
      id:college._id,
      name:college.name,
      slug:college.slug,
      branding:college.branding||{},
      customDomain:college.customDomain,
      subdomain:college.subdomain
    },
    modules,
    subscription:subscription?{
      status:subscription.status,
      billingCycle:subscription.billingCycle,
      plan:subscription.planId
    }:null
  });
}
module.exports={resolve};
