const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Role = require('../../models/Role');
const Branch = require('../../models/Branch');
const Employee = require('../../models/Employee');
const { audit } = require('../../services/auditService');
const { toId } = require('../../utils/normalize');
const { seedDefaultRoles } = require('../../services/roleService');

const DEFAULT_PASSWORD = 'user@123';
const USER_UPDATE_FIELDS=['name','email','cnic','phone','directPermissions','isActive'];
function pick(source,fields){const out={};for(const k of fields)if(source&&Object.prototype.hasOwnProperty.call(source,k))out[k]=source[k];return out;}

function isDirector(req){return (req.user?.roleCodes||[]).includes('director')}
function normalizeCnic(value){return String(value||'').replace(/\D/g,'')}
function syntheticEmail(cnic){return `${cnic}@cnic.local`}

exports.list = async (req,res) => {
  if (req.collegeId) await seedDefaultRoles(req.collegeId);
  const filter = req.tenantFilter({ _id: { $ne: req.user._id } });
  const type = String(req.query.type || 'all').toLowerCase();
  const status = String(req.query.status || 'all').toLowerCase();
  const q = String(req.query.q || '').trim();

  if (type === 'student') filter.linkedStudentId = { $ne: null };
  if (type === 'employee') filter.linkedEmployeeId = { $ne: null };
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [studentIds, employeeIds] = await Promise.all([
      require('../../models/Student').find(req.tenantFilter({ $or: [{ name: rx }, { rollNo: rx }, { email: rx }] })).distinct('_id'),
      Employee.find(req.tenantFilter({ $or: [{ name: rx }, { employeeNo: rx }, { employeeCode: rx }, { cnic: rx }, { email: rx }] })).distinct('_id')
    ]);
    filter.$or = [
      { name: rx }, { email: rx }, { cnic: rx }, { loginRollNo: rx },
      { linkedStudentId: { $in: studentIds } }, { linkedEmployeeId: { $in: employeeIds } }
    ];
  }

  const rows = await User.find(filter)
    .select('-passwordHash')
    .populate('roleIds', 'name code')
    .populate('linkedStudentId', 'name rollNo email status')
    .populate('linkedEmployeeId', 'name employeeNo employeeCode cnic email isActive')
    .sort({name:1});
  res.json(rows);
};

exports.create = async (req,res) => {
  if (req.body.linkedStudentId || req.body.linkedEmployeeId) return res.status(400).json({error:'Student and Employee accounts are provisioned from their own modules'});
  const {name,roleIds=[],directPermissions=[],phone,linkedStudentId,linkedEmployeeId,systemRole} = req.body;
  if(systemRole==='platform_owner'&&!req.isPlatformOwner)return res.status(403).json({error:'Cannot create platform owner'});
  const collegeId=systemRole==='platform_owner'?null:(req.isPlatformOwner?(req.body.collegeId||req.collegeId):req.user.collegeId);
  if(systemRole!=='platform_owner'&&!collegeId)return res.status(400).json({error:'collegeId required'});

  const rawEmail=String(req.body.email||'').trim().toLowerCase();
  let rawCnic=String(req.body.cnic||'').trim();
  let cnicNormalized=normalizeCnic(rawCnic);
  let employee=null;

  if(linkedEmployeeId){
    employee=await Employee.findOne({_id:linkedEmployeeId,collegeId});
    if(!employee)return res.status(400).json({error:'Linked employee was not found'});
    if(!rawCnic){rawCnic=employee.cnic||'';cnicNormalized=normalizeCnic(rawCnic)}
  }

  if(!name)return res.status(400).json({error:'Name is required'});
  if(!rawEmail&&!cnicNormalized)return res.status(400).json({error:'Email or CNIC is required for login'});
  if(cnicNormalized&&cnicNormalized.length!==13)return res.status(400).json({error:'CNIC must contain 13 digits'});

  await seedDefaultRoles(collegeId);
  let roles=[];
  if(roleIds.length){
    roles=await Role.find({_id:{$in:roleIds},collegeId,isActive:true});
    if(roles.length!==roleIds.length)return res.status(400).json({error:'Invalid role assignment'});
  }

  if(systemRole!=='platform_owner'&&!employee&&!roles.length)return res.status(400).json({error:'Select at least one role'});

  if(employee){
    const requiredCodes=['employee'];
    if(employee.category==='academic_staff')requiredCodes.push('teacher');
    const required=await Role.find({collegeId,code:{$in:requiredCodes},isActive:true});
    const map=new Map(roles.map(r=>[String(r._id),r]));
    required.forEach(r=>map.set(String(r._id),r));
    roles=[...map.values()];
  }

  const email=rawEmail||syntheticEmail(cnicNormalized);
  try{
    const u=await User.create({
      collegeId,
      name,
      email,
      emailIsSynthetic:!rawEmail,
      cnic:rawCnic,
      cnicNormalized,
      passwordHash:await bcrypt.hash(DEFAULT_PASSWORD,12),
      mustChangePassword:true,
      systemRole:systemRole==='platform_owner'?'platform_owner':undefined,
      roleIds:roles.map(r=>r._id),
      directPermissions,
      phone,
      linkedStudentId,
      linkedEmployeeId,
      branchAccess:{mode:'selected',branchIds:[]}
    });
    await audit(req,'USER_CREATE','User',u._id,{defaultPasswordIssued:true,roles:roles.map(r=>r.code)});
    res.status(201).json(await User.findById(u._id).select('-passwordHash').populate('roleIds'));
  }catch(e){
    if(e.code===11000){
      const field=e?.keyPattern?.cnicNormalized?'CNIC':'email';
      return res.status(409).json({error:`A user with this ${field} already exists`});
    }
    throw e;
  }
};

exports.update=async(req,res)=>{
  // Security: only fields managed by this endpoint may be updated. Role, tenant,
  // password, linkage and branch-access fields have dedicated workflows.
  const payload=pick(req.body,USER_UPDATE_FIELDS);
  if(payload.email!==undefined){payload.email=String(payload.email||'').trim().toLowerCase();if(!payload.email)delete payload.email;else payload.emailIsSynthetic=false}
  if(payload.cnic!==undefined){payload.cnic=String(payload.cnic||'').trim();payload.cnicNormalized=normalizeCnic(payload.cnic);if(payload.cnicNormalized&&payload.cnicNormalized.length!==13)return res.status(400).json({error:'CNIC must contain 13 digits'});}
  if(String(req.user._id)===String(req.params.id))delete payload.directPermissions;
  const u=await User.findOneAndUpdate(req.tenantFilter({_id:req.params.id}),payload,{new:true,runValidators:true}).select('-passwordHash').populate('roleIds');
  if(!u)return res.status(404).json({error:'User not found'});
  await audit(req,'USER_UPDATE','User',u._id);
  res.json(u);
};

exports.resetPassword=async(req,res)=>{
  const u=await User.findOne(req.tenantFilter({_id:req.params.id}));
  if(!u)return res.status(404).json({error:'User not found'});
  if(String(u._id)===String(req.user._id))return res.status(400).json({error:'Use Change Password for your own account'});
  u.passwordHash=await bcrypt.hash(DEFAULT_PASSWORD,12);
  u.mustChangePassword=true;
  u.passwordChangedAt=undefined;
  await u.save();
  await audit(req,'PASSWORD_RESET','User',u._id,{defaultPasswordIssued:true});
  res.json({message:`Password reset to ${DEFAULT_PASSWORD}. User must change it on next login.`});
};

exports.branchOptions=async(req,res)=>{
  if(req.isPlatformOwner&&!req.collegeId)return res.status(400).json({error:'collegeId is required'});
  res.json(await Branch.find(req.tenantFilter({isActive:true})).select('name code address isActive').sort({name:1}).lean());
};

exports.updateBranchAccess=async(req,res)=>{
  if(!req.isPlatformOwner&&!isDirector(req))return res.status(403).json({error:'Only the Director may assign Principal branch access'});
  const target=await User.findOne(req.tenantFilter({_id:req.params.id})).populate('roleIds');
  if(!target)return res.status(404).json({error:'User not found'});
  const isPrincipal=(target.roleIds||[]).some(r=>r.code==='principal'&&r.isActive);
  if(!isPrincipal)return res.status(400).json({error:'Branch access assignment is available for Principal users'});
  const mode=req.body.mode==='all'?'all':'selected';
  const branchIds=mode==='all'?[]:[...new Set((req.body.branchIds||[]).map(toId).filter(Boolean))];
  if(mode==='selected'&&branchIds.length){
    const count=await Branch.countDocuments(req.tenantFilter({_id:{$in:branchIds},isActive:true}));
    if(count!==branchIds.length)return res.status(400).json({error:'One or more selected branches are invalid'});
  }
  target.branchAccess={mode,branchIds};
  await target.save();
  await audit(req,'PRINCIPAL_BRANCH_ACCESS','User',target._id,{mode,branchIds});
  res.json(await User.findById(target._id).select('-passwordHash').populate('roleIds'));
};

exports.DEFAULT_PASSWORD=DEFAULT_PASSWORD;
