const Inquiry=require('../../models/Inquiry');
const AdmissionApplication=require('../../models/AdmissionApplication');
const Program=require('../../models/Program');
const AcademicSession=require('../../models/AcademicSession');
const College=require('../../models/College');
const Wing=require('../../models/Wing');
const {audit}=require('../../services/auditService');
const seq=require('../../services/sequenceService');
const {executePaged}=require('../../utils/pagination');

const collegeIdOf=req=>req.collegeId||req.user.collegeId;
function normalizeContact(value){let d=String(value||'').replace(/\D/g,'');if(d.startsWith('0092'))d=d.slice(2);if(d.startsWith('0'))d='92'+d.slice(1);if(d.length===10&&d.startsWith('3'))d='92'+d;return d;}
function esc(v){return String(v||'').trim().replace(/[.*+?^${}()|[\]\\]/g,'\$&');}
async function nextInquiryNo(collegeId){const year=new Date().getFullYear();const n=await seq.nextNumber(collegeId,`inquiry-${year}`);return `${String(year).slice(-2)}-${String(n).padStart(5,'0')}`;}
async function nextFormNo(collegeId,session){const {sessionYear}=require('../../services/rollNumberService');const year=sessionYear(session);const n=await seq.nextNumber(collegeId,`admission-form-${year}`);return `F${String(year).slice(-2)}${String(n).padStart(4,'0')}`;}

function normalizeResults(rows){
  return (Array.isArray(rows)?rows:[]).map(item=>({
    level:String(item.level||'').trim(),
    obtainedMarks:item.obtainedMarks===''||item.obtainedMarks===undefined||item.obtainedMarks===null?undefined:Number(item.obtainedMarks),
    totalMarks:item.totalMarks===''||item.totalMarks===undefined||item.totalMarks===null?undefined:Number(item.totalMarks),
    boardRollNo:String(item.boardRollNo||'').trim()||undefined
  })).filter(x=>x.level);
}
function validResult(row){
  const obtained=Number(row?.obtainedMarks),total=Number(row?.totalMarks);
  return Number.isFinite(obtained)&&Number.isFinite(total)&&obtained>=0&&total>0&&obtained<=total;
}
function requiredResultLevel(program){
  if(program?.academicType==='college')return '10th';
  if(program?.academicType==='university')return '12th';
  return null;
}
function resultByLevel(rows,level){return (rows||[]).find(x=>String(x.level||'').trim().toLowerCase()===String(level||'').toLowerCase());}

exports.listInquiries=async(req,res)=>{
  const q=req.tenantFilter();if(req.query.status)q.status=req.query.status;
  const rows=await executePaged({model:Inquiry,filter:q,req,res,defaultLimit:100,maxLimit:500,buildQuery:query=>query.populate('programId','name code academicSystem durationUnits').populate('academicSessionId','name startDate endDate isCurrent').populate('admissionApplicationId','formNo status rollNo').populate('followUps.createdBy','name email').sort({createdAt:-1}).lean()});
  res.json(rows);
};

exports.createInquiry=async(req,res)=>{
  const collegeId=collegeIdOf(req);
  const program=await Program.findOne({_id:req.body.programId,collegeId});
  if(!program)throw Object.assign(new Error('Invalid Program Interested'),{status:400});
  const academicSessionId=String(req.body.academicSessionId||'').trim();
  if(!academicSessionId)throw Object.assign(new Error('Academic Session is required'),{status:400});
  const academicSession=await AcademicSession.findOne({_id:academicSessionId,collegeId});
  if(!academicSession)throw Object.assign(new Error('Invalid Academic Session'),{status:400});
  const normalizedContactNo=normalizeContact(req.body.contactNo);
  if(!normalizedContactNo)throw Object.assign(new Error('Valid Contact No is required'),{status:400});
  const duplicates=await Inquiry.find({collegeId,status:{$ne:'not_interested'},$or:[{normalizedContactNo},{studentName:new RegExp(`^${esc(req.body.studentName)}$`,'i'),fatherName:new RegExp(`^${esc(req.body.fatherName)}$`,'i')}]}).populate('programId','name code').sort({createdAt:-1}).limit(10);
  if(duplicates.length&&req.body.forceDuplicate!==true)return res.status(409).json({code:'DUPLICATE_INQUIRY',error:'Possible duplicate inquiry found.',duplicates});
  const allowedReferenceTypes=['student','staff','social_media','advertisement','walk_in','other'];
  const referenceType=String(req.body.referenceType||'').trim();
  const referenceDetail=String(req.body.referenceDetail||'').trim();
  if(!allowedReferenceTypes.includes(referenceType))throw Object.assign(new Error('Valid Reference is required'),{status:400});
  if(['student','staff','other'].includes(referenceType)&&!referenceDetail)throw Object.assign(new Error('Reference Detail is required for the selected Reference'),{status:400});

  const previousResults=Array.isArray(req.body.previousResults)
    ? req.body.previousResults.map(item=>({
        level:item.level,
        obtainedMarks:item.obtainedMarks===''||item.obtainedMarks===undefined?undefined:Number(item.obtainedMarks),
        totalMarks:item.totalMarks===''||item.totalMarks===undefined?undefined:Number(item.totalMarks),
        boardRollNo:String(item.boardRollNo||'').trim()||undefined
      }))
    : [];

  const row=await Inquiry.create({
    collegeId,
    inquiryNo:await nextInquiryNo(collegeId),
    studentName:req.body.studentName,
    fatherName:req.body.fatherName,
    previousSchool:req.body.previousSchool,
    previousExamAppeared:req.body.previousExamAppeared,
    obtainedMarks:req.body.obtainedMarks===''?undefined:req.body.obtainedMarks,
    totalMarks:req.body.totalMarks===''?undefined:req.body.totalMarks,
    previousResults,
    address:req.body.address,
    contactNo:req.body.contactNo,
    normalizedContactNo,
    programId:req.body.programId,
    academicSessionId:academicSession._id,
    referenceType,
    referenceDetail:referenceDetail||undefined,
    status:'pending',
    notes:req.body.notes
  });
  await audit(req,'CREATE','Inquiry',row._id,{inquiryNo:row.inquiryNo});res.status(201).json(row);
};

exports.updateInquiryStatus=async(req,res)=>{
  const requestedStatus=req.body.status;
  if(!['followed_up','not_interested'].includes(requestedStatus))throw Object.assign(new Error('Invalid inquiry status transition'),{status:400});

  const row=await Inquiry.findOne(req.tenantFilter({_id:req.params.id}));
  if(!row)throw Object.assign(new Error('Inquiry not found'),{status:404});
  if(row.status==='form_submitted')throw Object.assign(new Error('Submitted inquiry cannot be moved back from this screen.'),{status:409});

  if(requestedStatus==='followed_up'){
    if(!['pending','followed_up'].includes(row.status))throw Object.assign(new Error('Only Pending or Followed Up inquiries can record a follow-up.'),{status:409});
    const remarks=String(req.body.remarks||'').trim();
    if(!remarks)throw Object.assign(new Error('Follow-up remarks are required.'),{status:400});

    const followUpDate=req.body.followUpDate?new Date(req.body.followUpDate):new Date();
    if(Number.isNaN(followUpDate.getTime()))throw Object.assign(new Error('Valid follow-up date is required.'),{status:400});

    const attemptNo=(row.followUps?.reduce((max,x)=>Math.max(max,Number(x.attemptNo)||0),0)||0)+1;
    row.followUps=row.followUps||[];
    row.followUps.push({attemptNo,followUpDate,remarks,createdBy:req.user._id});
    row.followUpDate=followUpDate;
    row.status='followed_up';
    await row.save();
    await audit(req,'INQUIRY_FOLLOW_UP','Inquiry',row._id,{attemptNo,followUpDate,remarks});
    return res.json(row);
  }

  if(row.status!=='followed_up')throw Object.assign(new Error('An inquiry can be marked Not Interested only after at least one follow-up.'),{status:409});
  const reason=String(req.body.remarks||req.body.notes||'').trim();
  if(!reason)throw Object.assign(new Error('Reason / remarks are required before marking Not Interested.'),{status:400});
  row.status='not_interested';
  row.notes=reason;
  await row.save();
  await audit(req,'INQUIRY_NOT_INTERESTED','Inquiry',row._id,{remarks:reason});
  res.json(row);
};

async function submitInquiryForm(req,res){
  const collegeId=collegeIdOf(req);
  const inquiry=await Inquiry.findOne(req.tenantFilter({_id:req.params.id}));
  if(!inquiry)throw Object.assign(new Error('Inquiry not found'),{status:404});
  if(!['pending','followed_up','form_submitted'].includes(inquiry.status)){
    throw Object.assign(new Error('Only Pending or Followed Up inquiries can be submitted as Form / Prospectus.'),{status:409});
  }

  // Form / Prospectus issuance is the point at which the admission form number
  // is reserved. The Inquiry must therefore already belong to an academic session.
  let sessionId=inquiry.academicSessionId;
  if(!sessionId&&req.body?.academicSessionId){
    const suppliedSession=await AcademicSession.findOne({_id:req.body.academicSessionId,collegeId});
    if(!suppliedSession)throw Object.assign(new Error('Selected Academic Session is invalid.'),{status:400});
    inquiry.academicSessionId=suppliedSession._id;
    sessionId=suppliedSession._id;
    await inquiry.save();
    await audit(req,'ASSIGN_INQUIRY_SESSION','Inquiry',inquiry._id,{academicSessionId:suppliedSession._id,legacyRepair:true});
  }
  if(!sessionId){
    throw Object.assign(new Error('Academic Session is required on the Inquiry before issuing Form / Prospectus.'),{status:400});
  }
  const session=await AcademicSession.findOne({_id:sessionId,collegeId});
  if(!session)throw Object.assign(new Error('Inquiry Academic Session is invalid.'),{status:400});

  const existing=await AdmissionApplication.findOne({collegeId,inquiryId:inquiry._id});
  if(existing){
    // Repair an older application created before form numbers were assigned at
    // Form / Prospectus submission.
    let changed=false;
    if(!existing.academicSessionId){existing.academicSessionId=session._id;changed=true;}
    if(!existing.formNo){existing.formNo=await nextFormNo(collegeId,session);changed=true;}
    if(changed)await existing.save();

    inquiry.status='form_submitted';
    inquiry.admissionApplicationId=existing._id;
    inquiry.formSubmittedAt=inquiry.formSubmittedAt||new Date();
    inquiry.formSubmittedBy=inquiry.formSubmittedBy||req.user._id;
    await inquiry.save();
    return res.json(existing);
  }

  const application=await AdmissionApplication.create({
    collegeId,
    inquiryId:inquiry._id,
    formNo:await nextFormNo(collegeId,session),
    studentName:inquiry.studentName,
    fatherName:inquiry.fatherName,
    address:inquiry.address,
    contactNo:inquiry.contactNo,
    previousSchool:inquiry.previousSchool,
    programId:inquiry.programId,
    academicSessionId:inquiry.academicSessionId,
    previousResults:inquiry.previousResults||[],
    referenceType:inquiry.referenceType,
    referenceDetail:inquiry.referenceDetail,
    status:'form_submitted',
    resultStatus:'awaiting_result',
    formSubmittedAt:new Date(),
    formSubmittedBy:req.user._id
  });

  inquiry.status='form_submitted';
  inquiry.admissionApplicationId=application._id;
  inquiry.formSubmittedAt=new Date();
  inquiry.formSubmittedBy=req.user._id;
  await inquiry.save();

  await audit(req,'INQUIRY_FORM_SUBMITTED','AdmissionApplication',application._id,{inquiryId:inquiry._id});
  return res.status(201).json(application);
}

exports.submitInquiryForm=submitInquiryForm;
// Backward-compatible name for older route/controller references.
exports.admitInquiry=submitInquiryForm;



// Admissions reporting: Inquiry / Not Interested / Form Submitted.
// Uses the existing Inquiry lifecycle as the source of truth; no duplicate report data is stored.
exports.admissionReport=async(req,res)=>{
  const collegeId=collegeIdOf(req);
  const type=String(req.query.type||'all').trim().toLowerCase();
  const allowed=new Set(['all','inquiry','not_interested','form_submitted']);
  if(!allowed.has(type))throw Object.assign(new Error('Invalid admissions report type'),{status:400});

  const q=req.tenantFilter();
  if(type==='inquiry')q.status={$in:['pending','followed_up']};
  if(type==='not_interested')q.status='not_interested';
  if(type==='form_submitted')q.status='form_submitted';
  if(req.query.academicSessionId)q.academicSessionId=req.query.academicSessionId;
  if(req.query.programId)q.programId=req.query.programId;

  if(req.query.wingId&&!req.query.programId){
    const programIds=await Program.find({collegeId,wingId:req.query.wingId}).distinct('_id');
    q.programId={$in:programIds};
  }

  if(req.query.from||req.query.to){
    q.createdAt={};
    if(req.query.from){const d=new Date(`${req.query.from}T00:00:00`);if(!Number.isNaN(d.getTime()))q.createdAt.$gte=d;}
    if(req.query.to){const d=new Date(`${req.query.to}T23:59:59.999`);if(!Number.isNaN(d.getTime()))q.createdAt.$lte=d;}
    if(!Object.keys(q.createdAt).length)delete q.createdAt;
  }

  const [rows,college,sessions,programs,wings,counts]=await Promise.all([
    Inquiry.find(q)
      .populate({path:'programId',select:'name code wingId',populate:{path:'wingId',select:'name code'}})
      .populate('academicSessionId','name startDate endDate isCurrent')
      .populate('admissionApplicationId','formNo status rollNo')
      .sort({createdAt:-1}).lean(),
    College.findById(collegeId).select('name code address contactNo email website logoUrl educationalSlogan').lean(),
    AcademicSession.find({collegeId}).select('name startDate endDate isCurrent').sort({startDate:-1,name:-1}).lean(),
    Program.find({collegeId,isActive:{$ne:false}}).select('name code wingId academicType offeringType').sort({name:1}).lean(),
    Wing.find({collegeId,isActive:{$ne:false}}).select('name code').sort({name:1}).lean(),
    Inquiry.aggregate([
      {$match:{collegeId}},
      {$group:{
        _id:null,
        inquiry:{$sum:{$cond:[{$in:['$status',['pending','followed_up']]},1,0]}},
        notInterested:{$sum:{$cond:[{$eq:['$status','not_interested']},1,0]}},
        formSubmitted:{$sum:{$cond:[{$eq:['$status','form_submitted']},1,0]}}
      }}
    ])
  ]);

  const summary=counts[0]||{inquiry:0,notInterested:0,formSubmitted:0};
  const inquiryCount=Number(summary.inquiry||0);
  const notInterestedCount=Number(summary.notInterested||0);
  const formSubmittedCount=Number(summary.formSubmitted||0);
  res.json({
    college,
    rows,
    meta:{sessions,programs,wings},
    counts:{inquiry:inquiryCount,notInterested:notInterestedCount,formSubmitted:formSubmittedCount,total:inquiryCount+notInterestedCount+formSubmittedCount}
  });
};

exports.listAdmissions=async(req,res)=>{
  const q=req.tenantFilter();if(req.query.status)q.status=req.query.status;
  const rows=await executePaged({model:AdmissionApplication,filter:q,req,res,defaultLimit:100,maxLimit:500,buildQuery:query=>query.populate('programId','name code academicSystem durationUnits').populate('academicSessionId','name startDate endDate').populate('feePackageId','name totalAmount version isLocked').populate('studentFeePlanId','totalAmount totalPaid balance status').sort({createdAt:-1}).lean()});
  res.json(rows);
};

exports.completeProfile=async(req,res)=>{
  const collegeId=collegeIdOf(req);const row=await AdmissionApplication.findOne(req.tenantFilter({_id:req.params.id}));if(!row)throw Object.assign(new Error('Admission record not found'),{status:404});
  const session=await AcademicSession.findOne({_id:req.body.academicSessionId,collegeId});if(!session)throw Object.assign(new Error('Valid academic session is required'),{status:400});
  const program=await Program.findOne({_id:req.body.programId||row.programId,collegeId});if(!program)throw Object.assign(new Error('Valid Program of Study is required'),{status:400});
  const gender=String(req.body.gender||'').trim().toLowerCase();if(!['male','female'].includes(gender))throw Object.assign(new Error('Gender is required and must be Male or Female because it is used for Roll No allocation.'),{status:400});
  req.body.gender=gender;
  for(const f of ['studentName','fatherName','address','contactNo','fatherContact','whatsappNo','email','guardianName','guardianContact','guardianRelation','bFormCnic','fatherCnic','bloodGroup','secondAddress','alternateContactNo','dateOfBirth','gender','programId','academicSessionId','periodNumber','migrationRequired','migrationCertificateNo','eligible'])if(req.body[f]!==undefined)row[f]=req.body[f];
  if(req.body.previousResults!==undefined)row.previousResults=normalizeResults(req.body.previousResults);
  if(!row.migrationRequired)row.migrationCertificateNo=undefined;
  if(!row.formNo)row.formNo=await nextFormNo(collegeId,session);
  row.status='fee_pending';
  await row.save();
  await audit(req,'COMPLETE_ADMISSION_PROFILE','AdmissionApplication',row._id,{formNo:row.formNo,eligible:row.eligible,requiredResultLevel:requiredResultLevel(program)});
  res.json(row);
};

exports.confirmAdmission=async(req,res)=>{
  const collegeId=collegeIdOf(req);
  const row=await AdmissionApplication.findOne(req.tenantFilter({_id:req.params.id}));
  if(!row)throw Object.assign(new Error('Admission record not found'),{status:404});
  if(row.status!=='provisional')throw Object.assign(new Error('Only Provisional admission can be confirmed.'),{status:409});
  const program=await Program.findOne({_id:row.programId,collegeId});
  if(!program)throw Object.assign(new Error('Admission Program not found.'),{status:400});
  if(req.body.previousResults!==undefined)row.previousResults=normalizeResults(req.body.previousResults);
  if(req.body.migrationCertificateNo!==undefined)row.migrationCertificateNo=String(req.body.migrationCertificateNo||'').trim()||undefined;
  if(req.body.eligible!==undefined)row.eligible=req.body.eligible===true;

  const requiredLevel=requiredResultLevel(program);
  const missing=[];
  if(row.eligible!==true)missing.push({field:'eligible',label:'Eligibility Check'});
  if(requiredLevel){
    const result=resultByLevel(row.previousResults,requiredLevel);
    if(!validResult(result))missing.push({field:'previousResults',level:requiredLevel,label:`${requiredLevel} obtained marks and total marks`});
    if(!String(result?.boardRollNo||'').trim())missing.push({field:'boardRollNo',level:requiredLevel,label:`${requiredLevel} Board Roll No.`});
  }
  if(row.migrationRequired&&!String(row.migrationCertificateNo||'').trim())missing.push({field:'migrationCertificateNo',label:'Migration/NOC No.'});
  if(!row.rollNo)missing.push({field:'rollNo',label:'Roll No'});
  if(missing.length){
    await row.save();
    return res.status(409).json({code:'CONFIRMATION_REQUIREMENTS_PENDING',error:`${missing.length} confirmation requirement${missing.length===1?'':'s'} remaining.`,missing});
  }
  row.resultStatus='verified';row.status='confirmed';row.confirmedAt=new Date();row.confirmedBy=req.user._id;await row.save();
  if(row.studentId){const Student=require('../../models/Student');await Student.updateOne({_id:row.studentId,collegeId},{$set:{admissionStanding:'confirmed',resultStatus:'verified'}});}
  await audit(req,'CONFIRM_ADMISSION','AdmissionApplication',row._id,{rollNo:row.rollNo,requiredResultLevel:requiredLevel});res.json(row);
};
