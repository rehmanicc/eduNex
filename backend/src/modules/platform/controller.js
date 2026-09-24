const { sendError: bad } = require('../../utils/request');
const crypto=require('crypto');
const bcrypt=require('bcryptjs');
const College=require('../../models/College');
const User=require('../../models/User');
const Role=require('../../models/Role');
const Student=require('../../models/Student');
const Employee=require('../../models/Employee');
const SubscriptionPlan=require('../../models/SubscriptionPlan');
const TenantSubscription=require('../../models/TenantSubscription');
const TenantModuleConfig=require('../../models/TenantModuleConfig');
const DomainVerification=require('../../models/DomainVerification');
const Branch=require('../../models/Branch');
const BranchWing=require('../../models/BranchWing');
const {WING_TYPES,WING_VALUES}=require('../../constants/wings');
const {seedDefaultRoles}=require('../../services/roleService');
const {audit}=require('../../services/auditService');

function slugify(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
async function uniqueCollegeSlug(name){
  const base=slugify(name)||'institution';
  let slug=base;
  let n=2;
  while(await College.exists({slug})) slug=`${base}-${n++}`;
  return slug;
}

async function listColleges(req,res){
  const rows=await College.find({}).sort({createdAt:-1}).lean();
  const ids=rows.map(x=>x._id);
  const [students,employees,subs]=await Promise.all([
    Student.aggregate([{$match:{collegeId:{$in:ids},status:'active'}},{$group:{_id:'$collegeId',count:{$sum:1}}}]),
    Employee.aggregate([{$match:{collegeId:{$in:ids},isActive:true}},{$group:{_id:'$collegeId',count:{$sum:1}}}]),
    TenantSubscription.find({collegeId:{$in:ids}}).populate('planId','name code').lean()
  ]);
  const sm=new Map(students.map(x=>[String(x._id),x.count]));
  const em=new Map(employees.map(x=>[String(x._id),x.count]));
  const subm=new Map(subs.map(x=>[String(x.collegeId),x]));
  res.json(rows.map(c=>({...c,studentCount:sm.get(String(c._id))||0,employeeCount:em.get(String(c._id))||0,subscription:subm.get(String(c._id))||null})));
}

async function createCollege(req,res){
  const name=String(req.body.name||'').trim();
  if(!name)return bad(res,'Institution name is required');
  // Slug is an internal identifier; Platform Owner never needs to enter it.
  const slug=await uniqueCollegeSlug(name);
  const subdomain=String(req.body.subdomain||slug).trim().toLowerCase();
  const subdomainExists=await College.exists({subdomain});
  if(subdomainExists)return bad(res,'Institution subdomain already exists',409);

  const enabledWings=[...new Set((req.body.enabledWings||[]).map(x=>String(x).toLowerCase()))];
  if(enabledWings.some(x=>!WING_VALUES.includes(x)))return bad(res,'Invalid wing type');

  const college=await College.create({
    name,
    slug,
    code:req.body.code,
    subdomain,
    domain:req.body.domain,
    customDomain:req.body.customDomain,
    logoUrl:req.body.logoUrl,
    branchLimit: Math.max(1, Number(req.body.branchLimit || 1)),
    enabledWings,
    isActive:req.body.isActive!==false
  });

  await seedDefaultRoles(college._id);
  await audit(req,'CREATE_COLLEGE','College',college._id,{slug:college.slug});
  res.status(201).json(college);
}

async function updateCollege(req,res){
  const allowed=['name','code','subdomain','customDomain','logoUrl','branchLimit','isActive','enabledWings'];
  const update={};
  for(const key of allowed)if(req.body[key]!==undefined)update[key]=req.body[key];
  if(update.enabledWings){
    update.enabledWings=[...new Set(update.enabledWings.map(x=>String(x).toLowerCase()))];
    if(update.enabledWings.some(x=>!WING_VALUES.includes(x)))return bad(res,'Invalid wing type');
  }
  const doc=await College.findOneAndUpdate({_id:req.params.id},{$set:update},{new:true,runValidators:true});
  if(!doc)return bad(res,'Institution not found',404);
  if(update.enabledWings)await BranchWing.updateMany({collegeId:doc._id,wingType:{$nin:update.enabledWings}},{$set:{isActive:false}});
  await audit(req,'UPDATE_COLLEGE','College',doc._id,{fields:Object.keys(update)});
  res.json(doc);
}

async function suspendCollege(req,res){
  const doc=await College.findById(req.params.id);if(!doc)return bad(res,'Institution not found',404);
  doc.isActive=false;await doc.save();
  await TenantSubscription.updateOne({collegeId:doc._id},{$set:{status:'suspended',updatedBy:req.user._id}});
  await audit(req,'SUSPEND_COLLEGE','College',doc._id);res.json(doc);
}
async function reactivateCollege(req,res){
  const doc=await College.findById(req.params.id);if(!doc)return bad(res,'Institution not found',404);
  doc.isActive=true;await doc.save();await audit(req,'REACTIVATE_COLLEGE','College',doc._id);res.json(doc);
}

async function listPlans(req,res){res.json(await SubscriptionPlan.find({}).sort({monthlyPrice:1}));}
async function createPlan(req,res){const doc=await SubscriptionPlan.create(req.body);await audit(req,'CREATE_SUBSCRIPTION_PLAN','SubscriptionPlan',doc._id);res.status(201).json(doc);}
async function updatePlan(req,res){const doc=await SubscriptionPlan.findByIdAndUpdate(req.params.id,{$set:req.body},{new:true,runValidators:true});if(!doc)return bad(res,'Plan not found',404);await audit(req,'UPDATE_SUBSCRIPTION_PLAN','SubscriptionPlan',doc._id);res.json(doc);}
async function assignSubscription(req,res){
  const college=await College.findById(req.params.collegeId);if(!college)return bad(res,'Institution not found',404);
  const plan=await SubscriptionPlan.findById(req.body.planId);if(!plan||!plan.isActive)return bad(res,'Invalid subscription plan');
  const doc=await TenantSubscription.findOneAndUpdate({collegeId:college._id},{$set:{planId:plan._id,billingCycle:req.body.billingCycle||'monthly',startDate:req.body.startDate||new Date(),endDate:req.body.endDate||null,status:req.body.status||'active',customPrice:req.body.customPrice,notes:req.body.notes,updatedBy:req.user._id},$setOnInsert:{createdBy:req.user._id}},{new:true,upsert:true,setDefaultsOnInsert:true});
  await audit(req,'ASSIGN_SUBSCRIPTION','TenantSubscription',doc._id,{collegeId:college._id,planId:plan._id});res.json(doc);
}

async function moduleConfig(req,res){res.json(await TenantModuleConfig.find({collegeId:req.params.collegeId}).sort({module:1}));}
async function updateModuleConfig(req,res){
  const {module,enabled,config}=req.body;if(!module)return bad(res,'module is required');
  const doc=await TenantModuleConfig.findOneAndUpdate({collegeId:req.params.collegeId,module},{$set:{enabled:enabled!==false,config:config||{},updatedBy:req.user._id}},{new:true,upsert:true,setDefaultsOnInsert:true});
  await audit(req,'UPDATE_TENANT_MODULE','TenantModuleConfig',doc._id,{collegeId:req.params.collegeId,module,enabled:doc.enabled});res.json(doc);
}

async function startDomainVerification(req,res){
  const college=await College.findById(req.params.collegeId);if(!college)return bad(res,'Institution not found',404);
  const domain=String(req.body.domain||'').trim().toLowerCase();if(!domain)return bad(res,'domain is required');
  const token=crypto.randomBytes(18).toString('hex');
  const doc=await DomainVerification.findOneAndUpdate({domain},{$set:{collegeId:college._id,type:req.body.type||'custom',verificationToken:token,verificationMethod:req.body.verificationMethod||'dns_txt',status:'pending',lastCheckedAt:null,errorMessage:null}},{new:true,upsert:true,setDefaultsOnInsert:true});
  await audit(req,'START_DOMAIN_VERIFICATION','DomainVerification',doc._id,{domain});
  res.json({...doc.toObject(),instructions:{recordType:'TXT',host:`_collegecms-verification.${domain}`,value:token}});
}
async function markDomainVerified(req,res){
  const doc=await DomainVerification.findOne({_id:req.params.id});if(!doc)return bad(res,'Domain verification not found',404);
  doc.status='verified';doc.verifiedAt=new Date();doc.lastCheckedAt=new Date();doc.errorMessage=null;await doc.save();
  if(doc.type==='custom')await College.updateOne({_id:doc.collegeId},{$set:{customDomain:doc.domain,domainVerified:true}});else await College.updateOne({_id:doc.collegeId},{$set:{subdomain:doc.domain}});
  await audit(req,'VERIFY_CUSTOM_DOMAIN','DomainVerification',doc._id,{domain:doc.domain});res.json(doc);
}

async function getCollegeStructure(req,res){
  const college=await College.findById(req.params.collegeId).select('name slug code enabledWings isActive').lean();
  if(!college)return bad(res,'Institution not found',404);
  const branches=await Branch.find({collegeId:college._id}).sort({name:1}).lean();
  const branchIds=branches.map(x=>x._id);
  const mappings=branchIds.length?await BranchWing.find({collegeId:college._id,branchId:{$in:branchIds}}).lean():[];
  const byBranch=new Map();
  for(const m of mappings){const k=String(m.branchId);if(!byBranch.has(k))byBranch.set(k,[]);if(m.isActive)byBranch.get(k).push(m.wingType);}
  const directorRole=await Role.findOne({collegeId:college._id,code:'director'}).lean();
  const directors=directorRole?await User.find({collegeId:college._id,roleIds:directorRole._id}).select('-passwordHash').sort({name:1}).lean():[];
  res.json({college,availableWings:WING_TYPES,enabledWings:college.enabledWings||[],branches:branches.map(b=>({...b,wingTypes:byBranch.get(String(b._id))||[]})),directors});
}

async function createDirector(req,res){
  const college=await College.findById(req.params.collegeId);if(!college)return bad(res,'Institution not found',404);
  const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
  if(!name||!email||password.length<8)return bad(res,'Director name, email and password (minimum 8 characters) are required');
  const roles=await seedDefaultRoles(college._id);const directorRole=roles.director;
  const exists=await User.exists({collegeId:college._id,email});if(exists)return bad(res,'A user with this email already exists in the institution',409);
  const user=await User.create({collegeId:college._id,name,email,phone:req.body.phone,passwordHash:await bcrypt.hash(password,12),roleIds:[directorRole._id],directPermissions:[],branchAccess:{mode:'all',branchIds:[]},isActive:true});
  await audit(req,'CREATE_DIRECTOR','User',user._id,{collegeId:college._id});res.status(201).json(await User.findById(user._id).select('-passwordHash').populate('roleIds'));
}
async function updateDirector(req,res){
  const college=await College.findById(req.params.collegeId);if(!college)return bad(res,'Institution not found',404);
  const role=await Role.findOne({collegeId:college._id,code:'director'});if(!role)return bad(res,'Director role not found',404);
  const user=await User.findOne({_id:req.params.userId,collegeId:college._id,roleIds:role._id});if(!user)return bad(res,'Director not found',404);
  for(const k of ['name','phone','isActive'])if(req.body[k]!==undefined)user[k]=req.body[k];
  user.branchAccess={mode:'all',branchIds:[]};await user.save();await audit(req,'UPDATE_DIRECTOR','User',user._id);res.json(await User.findById(user._id).select('-passwordHash').populate('roleIds'));
}
async function resetDirectorPassword(req,res){
  const college=await College.findById(req.params.collegeId);if(!college)return bad(res,'Institution not found',404);
  const role=await Role.findOne({collegeId:college._id,code:'director'});const user=role?await User.findOne({_id:req.params.userId,collegeId:college._id,roleIds:role._id}):null;if(!user)return bad(res,'Director not found',404);
  const password=String(req.body.password||'');if(password.length<8)return bad(res,'Password must be at least 8 characters');user.passwordHash=await bcrypt.hash(password,12);await user.save();await audit(req,'RESET_DIRECTOR_PASSWORD','User',user._id);res.json({message:'Director password updated'});
}

async function platformDashboard(req,res){
  const [colleges,activeColleges,plans,subscriptions,students,employees]=await Promise.all([College.countDocuments({}),College.countDocuments({isActive:true}),SubscriptionPlan.countDocuments({isActive:true}),TenantSubscription.countDocuments({status:{$in:['trial','active']}}),Student.countDocuments({status:'active'}),Employee.countDocuments({isActive:true})]);
  res.json({colleges,activeColleges,plans,activeSubscriptions:subscriptions,students,employees});
}

module.exports={listColleges,createCollege,updateCollege,suspendCollege,reactivateCollege,listPlans,createPlan,updatePlan,assignSubscription,moduleConfig,updateModuleConfig,startDomainVerification,markDomainVerified,platformDashboard,getCollegeStructure,createDirector,updateDirector,resetDirectorPassword};
