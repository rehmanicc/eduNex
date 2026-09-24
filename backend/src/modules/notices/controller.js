const { cleanIds } = require('../../utils/normalize');
const { collegeIdFromRequest: cid, sendError: bad } = require('../../utils/request');
const pushNotifications=require('../../services/pushNotificationService');
const path=require('path');
const Notice=require('../../models/Notice');
const NoticeCategory=require('../../models/NoticeCategory');
const NoticeSettings=require('../../models/NoticeSettings');
const Notification=require('../../models/Notification');
const User=require('../../models/User');
const Student=require('../../models/Student');
const Employee=require('../../models/Employee');
const AcademicSession=require('../../models/AcademicSession');
const Program=require('../../models/Program');
const Section=require('../../models/Section');
const Branch=require('../../models/Branch');
const Sequence=require('../../models/Sequence');
const {audit}=require('../../services/auditService');

function has(req,p){const perms=new Set(req.user?.permissions||req.user?.effectivePermissions||req.user?.directPermissions||[]);return req.user?.systemRole==='platform_owner'||perms.has('*')||perms.has(p)}
function asDate(v){return v?new Date(v):null}

async function ensureDefaultCategories(collegeId){
  const names=['General','Academic','Examination','Fee','Event','Holiday','Transport','Hostel','Library','Emergency'];
  const count=await NoticeCategory.countDocuments({collegeId});
  if(count)return;
  await NoticeCategory.insertMany(names.map(name=>({collegeId,name,isSystem:true})),{ordered:false}).catch(()=>{});
}
async function getSettings(collegeId){
  return NoticeSettings.findOneAndUpdate({collegeId},{$setOnInsert:{collegeId}},{new:true,upsert:true,setDefaultsOnInsert:true});
}
async function nextNoticeNo(collegeId){
  const yy=String(new Date().getFullYear()).slice(-2);
  const seq=await Sequence.findOneAndUpdate({collegeId,key:`notice-${yy}`},{$inc:{value:1},$setOnInsert:{collegeId,key:`notice-${yy}`}},{new:true,upsert:true,setDefaultsOnInsert:true});
  return `NTC-${yy}${String(seq.value).padStart(4,'0')}`;
}
function normalizedPayload(body){
  return {
    title:String(body.title||'').trim(),body:String(body.body||'').trim(),categoryId:body.categoryId||null,
    audience:body.audience||'all',branchId:body.branchId||null,academicSessionId:body.academicSessionId||null,
    targetProgramIds:cleanIds(body.targetProgramIds),targetSectionIds:cleanIds(body.targetSectionIds),
    employeeCategory:body.audience==='employee_category'?(body.employeeCategory||undefined):undefined,
    priority:body.priority||'normal',publishAt:asDate(body.publishAt)||new Date(),expireAt:asDate(body.expireAt),
    status:body.status||'draft'
  };
}
async function validatePayload(payload,settings){
  if(!payload.title)return 'Title is required';
  if(!payload.body)return 'Notice / Message is required';
  if(settings.requireExpiryDate&&!payload.expireAt)return 'Expiry Date is required by Notice Settings';
  if(payload.expireAt&&payload.publishAt&&payload.expireAt<payload.publishAt)return 'Expiry Date cannot be before Publish Date';
  if(payload.audience==='program'&&!payload.targetProgramIds.length)return 'Select at least one Program / Class';
  if(payload.audience==='section'&&!payload.targetSectionIds.length)return 'Select at least one Section';
  if(payload.audience==='employee_category'&&!payload.employeeCategory)return 'Select Employee Category';
  if(payload.status==='scheduled'&&!settings.allowScheduledPublishing)return 'Scheduled publishing is disabled in Notice Settings';
  return '';
}
async function refreshStatuses(collegeId){
  const now=new Date();
  await Notice.updateMany({collegeId,status:'scheduled',publishAt:{$lte:now}},{$set:{status:'published',publishedAt:now}});
  await Notice.updateMany({collegeId,status:{$in:['published','scheduled']},expireAt:{$ne:null,$lt:now}},{$set:{status:'expired'}});
}
async function populateNotice(q){
  return q.populate('categoryId','name').populate('branchId','name').populate('academicSessionId','name sessionName label').populate('targetProgramIds','name code').populate('targetSectionIds','name sectionName code').populate('createdBy','name');
}

async function meta(req,res){
  const collegeId=cid(req);await ensureDefaultCategories(collegeId);
  const [categories,sessions,programs,sections,branches,settings]=await Promise.all([
    NoticeCategory.find({collegeId,isActive:true}).sort({name:1}),AcademicSession.find({collegeId}).sort({startDate:-1}),
    Program.find({collegeId,isActive:true}).sort({name:1}),Section.find({collegeId}).sort({name:1}),Branch.find({collegeId,isActive:true}).sort({name:1}),getSettings(collegeId)
  ]);
  res.json({categories,sessions,programs,sections,branches,settings});
}
async function dashboard(req,res){
  const collegeId=cid(req);await refreshStatuses(collegeId);
  const [total,active,scheduled,expired,draft,recent,upcoming]=await Promise.all([
    Notice.countDocuments({collegeId}),Notice.countDocuments({collegeId,status:'published'}),Notice.countDocuments({collegeId,status:'scheduled'}),Notice.countDocuments({collegeId,status:'expired'}),Notice.countDocuments({collegeId,status:'draft'}),
    populateNotice(Notice.find({collegeId}).sort({createdAt:-1}).limit(6)),populateNotice(Notice.find({collegeId,status:'scheduled'}).sort({publishAt:1}).limit(6))
  ]);
  res.json({total,active,scheduled,expired,draft,recent,upcoming});
}
async function listNotices(req,res){
  const collegeId=cid(req);await refreshStatuses(collegeId);const now=new Date();
  const q={collegeId,status:'published',publishAt:{$lte:now},$or:[{expireAt:null},{expireAt:{$exists:false}},{expireAt:{$gte:now}}]};
  res.json(await populateNotice(Notice.find(q).sort({priority:-1,publishAt:-1})));
}
async function manageList(req,res){
  const collegeId=cid(req);await refreshStatuses(collegeId);const q={collegeId};
  if(req.query.status)q.status=req.query.status;if(req.query.categoryId)q.categoryId=req.query.categoryId;if(req.query.audience)q.audience=req.query.audience;
  if(req.query.from||req.query.to){q.publishAt={};if(req.query.from)q.publishAt.$gte=new Date(req.query.from);if(req.query.to){const d=new Date(req.query.to);d.setHours(23,59,59,999);q.publishAt.$lte=d;}}
  res.json(await populateNotice(Notice.find(q).sort({createdAt:-1})));
}
async function createNotice(req,res){
  const collegeId=cid(req),settings=await getSettings(collegeId);if(settings.enabled===false)return bad(res,'Notices module is disabled');
  const payload=normalizedPayload(req.body);const msg=await validatePayload(payload,settings);if(msg)return bad(res,msg);
  if(payload.status==='published'&&settings.requireApprovalBeforePublishing&&!has(req,'SEND_NOTICES'))payload.status='draft';
  if(payload.status==='scheduled'&&payload.publishAt<=new Date())payload.status='published';
  const doc=await Notice.create({...payload,collegeId,noticeNo:await nextNoticeNo(collegeId),createdBy:req.user._id});
  await audit(req,'CREATE_NOTICE','Notice',doc._id);res.status(201).json(doc);
}
async function updateNotice(req,res){
  const collegeId=cid(req),settings=await getSettings(collegeId);const doc=await Notice.findOne({_id:req.params.id,collegeId});if(!doc)return bad(res,'Notice not found',404);
  if(['published','expired','cancelled'].includes(doc.status))return bad(res,'Published/expired/cancelled notices cannot be edited. Create a new notice or cancel the current one.',409);
  const payload=normalizedPayload(req.body);const msg=await validatePayload(payload,settings);if(msg)return bad(res,msg);
  Object.assign(doc,payload);await doc.save();await audit(req,'UPDATE_NOTICE','Notice',doc._id);res.json(doc);
}
async function uploadAttachment(req,res){
  const collegeId=cid(req),settings=await getSettings(collegeId);if(settings.allowAttachments===false)return bad(res,'Attachments are disabled in Notice Settings');
  const doc=await Notice.findOne({_id:req.params.id,collegeId});if(!doc)return bad(res,'Notice not found',404);if(!req.file)return bad(res,'Attachment file is required');
  doc.attachmentUrl=`/uploads/notices/${req.file.filename}`;doc.attachmentName=req.file.originalname||path.basename(req.file.filename);await doc.save();await audit(req,'UPLOAD_NOTICE_ATTACHMENT','Notice',doc._id);res.json(doc);
}
async function publishNotice(req,res){
  const collegeId=cid(req),settings=await getSettings(collegeId);const notice=await Notice.findOne({_id:req.params.id,collegeId});if(!notice)return bad(res,'Notice not found',404);if(notice.status==='cancelled')return bad(res,'Cancelled notice cannot be published',409);
  const now=new Date();notice.status=notice.publishAt>now&&settings.allowScheduledPublishing?'scheduled':'published';notice.publishedBy=req.user._id;notice.publishedAt=notice.status==='published'?now:null;await notice.save();
  let userQuery={collegeId,isActive:true};
  if(notice.audience==='students'||notice.audience==='program'||notice.audience==='section'){
    const sq={collegeId,status:'active'};if(notice.branchId){const programs=await Program.find({collegeId,branchId:notice.branchId}).select('_id');sq.programId={$in:programs.map(x=>x._id)}}if(notice.academicSessionId)sq.academicSessionId=notice.academicSessionId;if(notice.audience==='program')sq.programId={$in:notice.targetProgramIds};if(notice.audience==='section')sq.sectionId={$in:notice.targetSectionIds};const ids=(await Student.find(sq).select('_id')).map(x=>x._id);userQuery.linkedStudentId={$in:ids};
  }else if(notice.audience==='employees'||notice.audience==='employee_category'){
    const eq={collegeId,isActive:true};if(notice.branchId)eq.branchId=notice.branchId;if(notice.audience==='employee_category')eq.category=notice.employeeCategory;const ids=(await Employee.find(eq).select('_id')).map(x=>x._id);userQuery.linkedEmployeeId={$in:ids};
  }
  let recipients=0;if(notice.status==='published'){const users=await User.find(userQuery).select('_id').lean();recipients=users.length;if(users.length)await Notification.insertMany(users.map(u=>({collegeId,userId:u._id,type:'notice',title:notice.title,message:notice.body,entityType:'Notice',entityId:notice._id})),{ordered:false}).catch(()=>{});pushNotifications.sendToUsers(collegeId,userQuery,{title:notice.title,body:notice.body,data:{type:'notice',noticeId:String(notice._id)}}).catch(err=>console.error('notice_push_error',err.message));}
  await audit(req,'PUBLISH_NOTICE','Notice',notice._id,{recipients,status:notice.status});res.json({notice,recipients});
}
async function cancelNotice(req,res){const collegeId=cid(req);const doc=await Notice.findOne({_id:req.params.id,collegeId});if(!doc)return bad(res,'Notice not found',404);if(doc.status==='expired')return bad(res,'Expired notice cannot be cancelled',409);doc.status='cancelled';doc.cancelledBy=req.user._id;doc.cancelledAt=new Date();await doc.save();await audit(req,'CANCEL_NOTICE','Notice',doc._id);res.json(doc)}
async function categories(req,res){const collegeId=cid(req);await ensureDefaultCategories(collegeId);res.json(await NoticeCategory.find({collegeId}).sort({name:1}))}
async function createCategory(req,res){const name=String(req.body.name||'').trim();if(!name)return bad(res,'Category name is required');try{const doc=await NoticeCategory.create({collegeId:cid(req),name});res.status(201).json(doc)}catch(e){if(e?.code===11000)return bad(res,'Category already exists',409);throw e}}
async function updateCategory(req,res){const doc=await NoticeCategory.findOneAndUpdate({_id:req.params.id,collegeId:cid(req)},{$set:{name:String(req.body.name||'').trim(),isActive:req.body.isActive!==false}},{new:true,runValidators:true});if(!doc)return bad(res,'Category not found',404);res.json(doc)}
async function settings(req,res){res.json(await getSettings(cid(req)))}
async function saveSettings(req,res){const allowed=['enabled','allowScheduledPublishing','requireExpiryDate','allowAttachments','defaultValidityDays','allowEmployeesToCreate','requireApprovalBeforePublishing'];const $set={};allowed.forEach(k=>{if(req.body[k]!==undefined)$set[k]=req.body[k]});res.json(await NoticeSettings.findOneAndUpdate({collegeId:cid(req)},{$set,$setOnInsert:{collegeId:cid(req)}},{new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}))}
async function listNotifications(req,res){res.json(await Notification.find({collegeId:cid(req),userId:req.user._id}).sort({createdAt:-1}).limit(100))}
async function markRead(req,res){const doc=await Notification.findOneAndUpdate({_id:req.params.id,collegeId:cid(req),userId:req.user._id},{$set:{isRead:true,readAt:new Date()}},{new:true});if(!doc)return bad(res,'Notification not found',404);res.json(doc)}
async function markAllRead(req,res){await Notification.updateMany({collegeId:cid(req),userId:req.user._id,isRead:false},{$set:{isRead:true,readAt:new Date()}});res.json({message:'Notifications marked read'})}
module.exports={meta,dashboard,listNotices,manageList,createNotice,updateNotice,uploadAttachment,publishNotice,cancelNotice,categories,createCategory,updateCategory,settings,saveSettings,listNotifications,markRead,markAllRead};
