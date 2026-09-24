const pushNotifications=require('../../services/pushNotificationService');
const Exam = require('../../models/Exam');
const ExamType = require('../../models/ExamType');
const GradingScheme = require('../../models/GradingScheme');
const ExamSchedule = require('../../models/ExamSchedule');
const ExamResult = require('../../models/ExamResult');
const Student = require('../../models/Student');
const Program = require('../../models/Program');
const Section = require('../../models/Section');
const Course = require('../../models/Course');
const AcademicSession = require('../../models/AcademicSession');
const TeacherAssignment = require('../../models/TeacherAssignment');
const { audit } = require('../../services/auditService');
const scope = require('../../services/dataScopeService');
const { toId } = require('../../utils/normalize');
const seq = require('../../services/sequenceService');

function collegeId(req){ return req.collegeId || req.user?.collegeId; }
function can(user,p){ return user?.systemRole==='platform_owner' || (user?.effectivePermissions||user?.permissions||[]).includes('*') || (user?.effectivePermissions||user?.permissions||[]).includes(p); }
function bad(res,msg,status=400,extra={}){ return res.status(status).json({error:msg,...extra}); }
function clean(v){ return String(v??'').trim(); }
function pick(source,fields){const out={};for(const k of fields)if(source&&Object.prototype.hasOwnProperty.call(source,k))out[k]=source[k];return out;}
const EXAM_TYPE_UPDATE_FIELDS=['name','code','weightage','isActive'];
const GRADING_SCHEME_UPDATE_FIELDS=['name','bands','isDefault','isActive'];
function sameDay(a,b){ return new Date(a).toISOString().slice(0,10)===new Date(b).toISOString().slice(0,10); }
function academicYear(session){
  const d=new Date(session?.startDate||'');
  if(!Number.isNaN(d.getTime()))return d.getFullYear();
  const m=String(session?.name||'').match(/20\d{2}/);
  return m?Number(m[0]):new Date().getFullYear();
}
async function nextExamCode(cid,session){
  const year=academicYear(session);
  let code;
  do{
    const n=await seq.nextNumber(cid,`exam-${year}`);
    code=`EX${String(year).slice(-2)}${String(n).padStart(4,'0')}`;
  }while(await Exam.exists({collegeId:cid,code}));
  return code;
}
function assignmentMatchesSchedule(a,schedule){
  return toId(a.sectionId)===toId(schedule.sectionId) && toId(a.courseId)===toId(schedule.courseId) && (!schedule.academicSessionId || toId(a.academicSessionId)===toId(schedule.academicSessionId));
}
async function teacherOwnsSchedule(user,cid,schedule){
  const assignments=await scope.teacherAssignments(user,cid);
  return assignments.some(a=>assignmentMatchesSchedule(a,schedule));
}
function teacherResultPairs(assignments){
  return assignments.map(a=>({sectionId:a.sectionId,courseId:a.courseId}));
}

function applyGrade(scheme, percentage){
  const bands = [...(scheme?.bands||[])].sort((a,b)=>b.minPercentage-a.minPercentage);
  const band = bands.find(b => percentage >= Number(b.minPercentage) && percentage <= Number(b.maxPercentage));
  return band ? {grade:band.grade,gradePoint:Number(band.gradePoint||0),remarks:band.remarks||''} : {grade:'',gradePoint:0,remarks:''};
}
async function getScheme(exam,cid){
  if(exam.gradingSchemeId) return GradingScheme.findOne({_id:exam.gradingSchemeId,collegeId:cid,isActive:true}).lean();
  return GradingScheme.findOne({collegeId:cid,isDefault:true,isActive:true}).lean();
}
async function activeStudentsForSchedule(cid,schedule){
  return Student.find({
    collegeId:cid,
    sectionId:schedule.sectionId,
    academicSessionId:schedule.academicSessionId,
    status:'active'
  }).select('_id admissionNo registrationNo rollNo name fatherName').sort({rollNo:1,name:1}).lean();
}

async function listExamTypes(req,res){ res.json(await ExamType.find({collegeId:collegeId(req)}).sort({isActive:-1,name:1})); }
async function createExamType(req,res){
  const name=clean(req.body.name), code=clean(req.body.code).toUpperCase();
  if(!name||!code)return bad(res,'Exam type name and code are required');
  const doc=await ExamType.create({collegeId:collegeId(req),name,code,weightage:Number(req.body.weightage??100),isActive:req.body.isActive!==false});
  await audit(req,'CREATE_EXAM_TYPE','ExamType',doc._id,{code:doc.code}); res.status(201).json(doc);
}
async function updateExamType(req,res){
  const doc=await ExamType.findOneAndUpdate({_id:req.params.id,collegeId:collegeId(req)},{$set:{...pick(req.body,EXAM_TYPE_UPDATE_FIELDS),...(req.body.code!==undefined?{code:clean(req.body.code).toUpperCase()}:{})}},{new:true,runValidators:true});
  if(!doc)return bad(res,'Exam type not found',404); await audit(req,'UPDATE_EXAM_TYPE','ExamType',doc._id); res.json(doc);
}

function validateBands(bands){
  if(!Array.isArray(bands)||!bands.length)return 'At least one grading band is required';
  for(const b of bands){
    const min=Number(b.minPercentage), max=Number(b.maxPercentage);
    if(!Number.isFinite(min)||!Number.isFinite(max)||min<0||max>100||min>max||!clean(b.grade))return 'Invalid grading band';
  }
  return null;
}
async function listGradingSchemes(req,res){ res.json(await GradingScheme.find({collegeId:collegeId(req)}).sort({isDefault:-1,isActive:-1,name:1})); }
async function createGradingScheme(req,res){
  const cid=collegeId(req), name=clean(req.body.name), bands=req.body.bands||[]; const err=validateBands(bands);
  if(!name)return bad(res,'Grading scheme name is required'); if(err)return bad(res,err);
  if(req.body.isDefault)await GradingScheme.updateMany({collegeId:cid},{$set:{isDefault:false}});
  const doc=await GradingScheme.create({collegeId:cid,name,bands,isDefault:!!req.body.isDefault,isActive:req.body.isActive!==false});
  await audit(req,'CREATE_GRADING_SCHEME','GradingScheme',doc._id); res.status(201).json(doc);
}
async function updateGradingScheme(req,res){
  const cid=collegeId(req); if(req.body.bands){const err=validateBands(req.body.bands);if(err)return bad(res,err);}
  if(req.body.isDefault)await GradingScheme.updateMany({collegeId:cid,_id:{$ne:req.params.id}},{$set:{isDefault:false}});
  const doc=await GradingScheme.findOneAndUpdate({_id:req.params.id,collegeId:cid},{$set:pick(req.body,GRADING_SCHEME_UPDATE_FIELDS)},{new:true,runValidators:true});
  if(!doc)return bad(res,'Grading scheme not found',404); await audit(req,'UPDATE_GRADING_SCHEME','GradingScheme',doc._id); res.json(doc);
}

async function listExams(req,res){
  const q={collegeId:collegeId(req)}; if(req.query.academicSessionId)q.academicSessionId=req.query.academicSessionId;if(req.query.status)q.status=req.query.status;
  res.json(await Exam.find(q).populate('examTypeId gradingSchemeId academicSessionId').sort({startDate:-1,name:1}));
}
async function createExam(req,res){
  const cid=collegeId(req), name=clean(req.body.name); const {academicSessionId,startDate,endDate}=req.body;
  if(!name||!academicSessionId||!startDate||!endDate)return bad(res,'Name, Academic Session, Start Date and End Date are required');
  const session=await AcademicSession.findOne({_id:academicSessionId,collegeId:cid});if(!session)return bad(res,'Invalid academic session');
  if(new Date(endDate)<new Date(startDate))return bad(res,'End Date cannot be before Start Date');
  const payload={...req.body,name,collegeId:cid,status:'draft',code:await nextExamCode(cid,session)};
  const doc=await Exam.create(payload); await audit(req,'CREATE_EXAM','Exam',doc._id,{code:doc.code}); res.status(201).json(doc);
}
async function updateExam(req,res){
  const cid=collegeId(req), exam=await Exam.findOne({_id:req.params.id,collegeId:cid});if(!exam)return bad(res,'Exam not found',404);
  if(['published','closed'].includes(exam.status))return bad(res,'Published/closed exam cannot be edited',409);
  const next={...req.body};if(next.endDate&&new Date(next.endDate)<new Date(next.startDate||exam.startDate))return bad(res,'End Date cannot be before Start Date');
  delete next.collegeId;delete next.status;delete next.code;Object.assign(exam,next);await exam.save();await audit(req,'UPDATE_EXAM','Exam',exam._id);res.json(exam);
}
async function deleteExam(req,res){
  const cid=collegeId(req), exam=await Exam.findOne({_id:req.params.id,collegeId:cid});if(!exam)return bad(res,'Exam not found',404);
  if(exam.status!=='draft')return bad(res,'Only a Draft exam can be deleted',409);
  if(await ExamSchedule.exists({collegeId:cid,examId:exam._id}))return bad(res,'Delete Date Sheet entries before deleting this exam',409);
  await Exam.deleteOne({_id:exam._id});await audit(req,'DELETE_EXAM','Exam',exam._id);res.json({message:'Exam deleted'});
}

async function listSchedules(req,res){
  const cid=collegeId(req), q={collegeId:cid};if(req.query.examId)q.examId=req.query.examId;if(req.query.sectionId)q.sectionId=req.query.sectionId;if(req.query.programId)q.programId=req.query.programId;
  let docs=await ExamSchedule.find(q).populate('examId','name status startDate endDate academicSessionId').populate('courseId','name code creditHours periodNumber').populate('sectionId','name periodNumber genderType').populate('programId','name code academicSystem').populate('teacherAssignmentId').sort({examDate:1,startTime:1});
  if(scope.isTeacherUser(req.user)){
    const assignments=await scope.teacherAssignments(req.user,cid);docs=docs.filter(d=>assignments.some(a=>assignmentMatchesSchedule(a,d)));
  } else if(scope.isStudentUser(req.user)){
    const student=await Student.findOne({_id:req.user.linkedStudentId,collegeId:cid}).select('sectionId').lean();docs=docs.filter(d=>student&&toId(d.sectionId?._id||d.sectionId)===toId(student.sectionId)&&d.isPublished);
  }
  res.json(docs);
}
async function validateScheduleInput(cid,body,existingId=null){
  const {examId,sectionId,courseId,examDate,startTime}=body;const endTime=clean(body.endTime);if(!examId||!sectionId||!courseId||!examDate||!startTime)return {error:'Exam, Section, Course, Date and Start Time are required'};
  if(endTime&&startTime>=endTime)return {error:'End Time must be after Start Time'};
  const exam=await Exam.findOne({_id:examId,collegeId:cid});if(!exam)return {error:'Exam not found'};if(['published','closed'].includes(exam.status))return {error:'Date Sheet is locked after result publication'};
  const section=await Section.findOne({_id:sectionId,collegeId:cid,academicSessionId:exam.academicSessionId,isActive:true});if(!section)return {error:'Section does not belong to the exam Academic Session'};
  const course=await Course.findOne({_id:courseId,collegeId:cid,programId:section.programId,isActive:true});if(!course)return {error:'Course does not belong to the selected Program/Class'};
  if(Number(course.periodNumber)!==Number(section.periodNumber))return {error:'Course period does not match the selected Section'};
  // A subject may appear only once for the same Exam + Section.  Check this
  // before MongoDB's unique index so the API returns a useful 409 instead of
  // allowing E11000 to escape and look like a Network Error in the frontend.
  const duplicateQ={collegeId:cid,examId:exam._id,sectionId:section._id,courseId:course._id};
  if(existingId)duplicateQ._id={$ne:existingId};
  const duplicate=await ExamSchedule.exists(duplicateQ);
  if(duplicate)return {error:`${course.code||course.name} is already added to the Date Sheet for section ${section.name}. Edit the existing paper instead.`};
  const date=new Date(examDate);const start=new Date(exam.startDate),end=new Date(exam.endDate);start.setHours(0,0,0,0);end.setHours(23,59,59,999);if(date<start||date>end)return {error:'Exam Date must be within the exam date range'};
  const assignment=await TeacherAssignment.findOne({collegeId:cid,academicSessionId:exam.academicSessionId,programId:section.programId,sectionId,courseId,isActive:true});
  const clashQ=endTime?{collegeId:cid,examDate:date,startTime:{$lt:endTime},endTime:{$gt:startTime,$ne:''}}:{collegeId:cid,examDate:date,startTime};if(existingId)clashQ._id={$ne:existingId};
  const conflicts=[{sectionId}];if(assignment)conflicts.push({teacherAssignmentId:assignment._id});clashQ.$or=conflicts;
  const clash=await ExamSchedule.findOne(clashQ).populate('courseId','name code').populate('sectionId','name');
  if(clash)return {error:`Date Sheet clash with ${clash.courseId?.code||clash.courseId?.name||'another paper'} (${clash.sectionId?.name||'section'})`};
  return {exam,section,course,assignment,date};
}
async function createSchedule(req,res){
  const cid=collegeId(req), valid=await validateScheduleInput(cid,req.body);if(valid.error)return bad(res,valid.error,409);
  const totalMarks=Number(req.body.totalMarks||100),passingMarks=Number(req.body.passingMarks||40);if(!Number.isFinite(totalMarks)||totalMarks<=0||!Number.isFinite(passingMarks)||passingMarks<0||passingMarks>totalMarks)return bad(res,'Invalid Total/Passing Marks');
  let doc;
  try{
    doc=await ExamSchedule.create({collegeId:cid,examId:valid.exam._id,academicSessionId:valid.exam.academicSessionId,programId:valid.section.programId,sectionId:valid.section._id,courseId:valid.course._id,teacherAssignmentId:valid.assignment?._id||null,examDate:valid.date,startTime:req.body.startTime,endTime:clean(req.body.endTime),room:clean(req.body.room),totalMarks,passingMarks,isPublished:false,notes:clean(req.body.notes)});
  }catch(err){
    if(err?.code===11000)return bad(res,`${valid.course.code||valid.course.name} is already added to the Date Sheet for section ${valid.section.name}. Edit the existing paper instead.`,409);
    throw err;
  }
  if(valid.exam.status==='draft'){valid.exam.status='scheduled';await valid.exam.save();}await audit(req,'CREATE_EXAM_SCHEDULE','ExamSchedule',doc._id);res.status(201).json(doc);
}

async function createSchedulesBatch(req,res){
  const cid=collegeId(req);
  const targets=Array.isArray(req.body.targets)?req.body.targets:[];
  if(!req.body.examId||!targets.length)return bad(res,'Exam and at least one Class / Section are required');
  const totalMarks=Number(req.body.totalMarks||100),passingMarks=Number(req.body.passingMarks||40);
  if(!Number.isFinite(totalMarks)||totalMarks<=0||!Number.isFinite(passingMarks)||passingMarks<0||passingMarks>totalMarks)return bad(res,'Invalid Total/Passing Marks');
  const seenSections=new Set(),validated=[];
  for(const target of targets){
    const sectionId=toId(target.sectionId);
    if(!sectionId||seenSections.has(sectionId))return bad(res,'Each Class / Section can only be selected once');
    seenSections.add(sectionId);
    const body={...req.body,sectionId,courseId:target.courseId};
    const valid=await validateScheduleInput(cid,body);
    if(valid.error)return bad(res,`${valid.section?.name?valid.section.name+': ':''}${valid.error}`,409);
    validated.push(valid);
  }
  let docs;
  try{
    docs=await ExamSchedule.insertMany(validated.map(valid=>({collegeId:cid,examId:valid.exam._id,academicSessionId:valid.exam.academicSessionId,programId:valid.section.programId,sectionId:valid.section._id,courseId:valid.course._id,teacherAssignmentId:valid.assignment?._id||null,examDate:valid.date,startTime:req.body.startTime,endTime:clean(req.body.endTime),room:clean(req.body.room),totalMarks,passingMarks,isPublished:false,notes:clean(req.body.notes)})));
  }catch(err){
    if(err?.code===11000)return bad(res,'One or more selected sections already have this subject in the Date Sheet for this exam. Edit the existing paper or exclude those sections.',409);
    throw err;
  }
  const exam=validated[0]?.exam;if(exam&&exam.status==='draft'){exam.status='scheduled';await exam.save();}
  for(const doc of docs)await audit(req,'CREATE_EXAM_SCHEDULE','ExamSchedule',doc._id,{batch:true});
  res.status(201).json({message:`${docs.length} Date Sheet entries created`,count:docs.length,items:docs});
}

async function updateSchedule(req,res){
  const cid=collegeId(req), current=await ExamSchedule.findOne({_id:req.params.id,collegeId:cid});if(!current)return bad(res,'Schedule not found',404);if(current.marksVerifiedAt)return bad(res,'Verified paper cannot be edited',409);
  const merged={...current.toObject(),...req.body,examId:req.body.examId||current.examId,sectionId:req.body.sectionId||current.sectionId,courseId:req.body.courseId||current.courseId,examDate:req.body.examDate||current.examDate,startTime:req.body.startTime||current.startTime,endTime:Object.prototype.hasOwnProperty.call(req.body,'endTime')?clean(req.body.endTime):current.endTime};
  const valid=await validateScheduleInput(cid,merged,current._id);if(valid.error)return bad(res,valid.error,409);const totalMarks=Number(merged.totalMarks),passingMarks=Number(merged.passingMarks);if(passingMarks>totalMarks)return bad(res,'Passing Marks cannot exceed Total Marks');
  Object.assign(current,{...req.body,academicSessionId:valid.exam.academicSessionId,programId:valid.section.programId,teacherAssignmentId:valid.assignment?._id||null});await current.save();await audit(req,'UPDATE_EXAM_SCHEDULE','ExamSchedule',current._id);res.json(current);
}
async function deleteSchedule(req,res){
  const cid=collegeId(req), doc=await ExamSchedule.findOne({_id:req.params.id,collegeId:cid});if(!doc)return bad(res,'Schedule not found',404);if(doc.marksVerifiedAt)return bad(res,'Verified paper cannot be deleted',409);if(await ExamResult.exists({collegeId:cid,scheduleId:doc._id}))return bad(res,'Marks already exist for this paper',409);
  await ExamSchedule.deleteOne({_id:doc._id});await audit(req,'DELETE_EXAM_SCHEDULE','ExamSchedule',doc._id);res.json({message:'Date Sheet entry deleted'});
}
async function publishSchedule(req,res){const doc=await ExamSchedule.findOneAndUpdate({_id:req.params.id,collegeId:collegeId(req)},{$set:{isPublished:true}},{new:true});if(!doc)return bad(res,'Schedule not found',404);await audit(req,'PUBLISH_EXAM_SCHEDULE','ExamSchedule',doc._id);res.json(doc);}
async function publishDateSheet(req,res){const cid=collegeId(req),exam=await Exam.findOne({_id:req.params.examId,collegeId:cid});if(!exam)return bad(res,'Exam not found',404);const total=await ExamSchedule.countDocuments({collegeId:cid,examId:exam._id});if(!total)return bad(res,'Add at least one Date Sheet paper before publishing',409);const draft=await ExamSchedule.countDocuments({collegeId:cid,examId:exam._id,isPublished:{$ne:true}});if(!draft)return res.json({message:'Date Sheet is already fully published.',count:0,total});const result=await ExamSchedule.updateMany({collegeId:cid,examId:exam._id,isPublished:{$ne:true}},{$set:{isPublished:true}});if(exam.status==='draft'){exam.status='scheduled';await exam.save();}await audit(req,'PUBLISH_DATE_SHEET','Exam',exam._id,{publishedCount:result.modifiedCount,total});
  const sectionIds=await ExamSchedule.distinct('sectionId',{collegeId:cid,examId:exam._id,isPublished:true});
  const studentIds=await Student.find({collegeId:cid,sectionId:{$in:sectionIds},status:'active'}).distinct('_id');
  pushNotifications.sendToStudentIds(cid,studentIds,{title:'Date Sheet Published',body:`${exam.name} date sheet is now available.`,data:{type:'datesheet',examId:String(exam._id)}}).catch(err=>console.error('datesheet_push_error',err.message));
  res.json({message:`Date Sheet published. ${result.modifiedCount} paper ${result.modifiedCount===1?'entry':'entries'} published.`,count:result.modifiedCount,total});}

async function roster(req,res){
  const cid=collegeId(req),schedule=await ExamSchedule.findOne({_id:req.params.scheduleId,collegeId:cid}).populate('courseId','name code').populate('sectionId','name').populate('examId','name status');if(!schedule)return bad(res,'Schedule not found',404);
  if(scope.isTeacherUser(req.user)){if(!(await teacherOwnsSchedule(req.user,cid,schedule)))return bad(res,'Not assigned to this course/section',403);}else if(!scope.hasFullCollegeAcademicScope(req.user)&&!can(req.user,'ENTER_EXAM_MARKS'))return bad(res,'Access denied',403);
  const students=await activeStudentsForSchedule(cid,schedule),existing=await ExamResult.find({collegeId:cid,scheduleId:schedule._id}).lean(),map=new Map(existing.map(r=>[toId(r.studentId),r]));
  res.json({schedule,students:students.map(s=>({...s,result:map.get(toId(s._id))||null}))});
}
async function saveMarks(req,res){
  const cid=collegeId(req),schedule=await ExamSchedule.findOne({_id:req.params.scheduleId,collegeId:cid});if(!schedule)return bad(res,'Schedule not found',404);const exam=await Exam.findOne({_id:schedule.examId,collegeId:cid});if(!exam)return bad(res,'Exam not found',404);
  if(['published','closed'].includes(exam.status))return bad(res,'Marks are locked after result publication',409);if(schedule.marksVerifiedAt)return bad(res,'Marks are verified. Reopen before editing.',409);
  if(scope.isTeacherUser(req.user)){if(!(await teacherOwnsSchedule(req.user,cid,schedule)))return bad(res,'You are not assigned to this course/section',403);}else if(!can(req.user,'ENTER_EXAM_MARKS'))return bad(res,'Permission denied',403);
  if(!Array.isArray(req.body.marks))return bad(res,'Marks array is required');const students=await activeStudentsForSchedule(cid,schedule),validSet=new Set(students.map(s=>toId(s._id))),scheme=await getScheme(exam,cid),ops=[];
  for(const item of req.body.marks){if(!validSet.has(toId(item.studentId)))return bad(res,'A submitted student is not active in this section');const absent=item.absent===true,withheld=item.withheld===true;let marks=null,status='pending',percentage=0,g={grade:'',gradePoint:0,remarks:''};
    if(absent)status='absent';else if(withheld)status='withheld';else {if(item.marksObtained===''||item.marksObtained===null||item.marksObtained===undefined)continue;marks=Number(item.marksObtained);if(!Number.isFinite(marks)||marks<0||marks>schedule.totalMarks)return bad(res,`Marks must be between 0 and ${schedule.totalMarks}`);percentage=Number(((marks/schedule.totalMarks)*100).toFixed(2));g=applyGrade(scheme,percentage);status=marks>=schedule.passingMarks?'pass':'fail';}
    ops.push({updateOne:{filter:{collegeId:cid,scheduleId:schedule._id,studentId:item.studentId},update:{$set:{examId:exam._id,sectionId:schedule.sectionId,courseId:schedule.courseId,totalMarks:schedule.totalMarks,marksObtained:marks,percentage,grade:g.grade,gradePoint:g.gradePoint,resultStatus:status,remarks:clean(item.remarks)||g.remarks,enteredBy:req.user._id,enteredAt:new Date(),verifiedBy:null,verifiedAt:null,publishedAt:null}},upsert:true}});
  }
  if(ops.length)await ExamResult.bulkWrite(ops);if(['draft','scheduled'].includes(exam.status)){exam.status='marks_entry';await exam.save();}await audit(req,'SAVE_EXAM_MARKS','ExamSchedule',schedule._id,{count:ops.length});res.json({message:'Marks saved',count:ops.length});
}
async function verifyMarks(req,res){
  const cid=collegeId(req),schedule=await ExamSchedule.findOne({_id:req.params.scheduleId,collegeId:cid});if(!schedule)return bad(res,'Schedule not found',404);const students=await activeStudentsForSchedule(cid,schedule),results=await ExamResult.find({collegeId:cid,scheduleId:schedule._id}).lean();
  if(results.length<students.length)return bad(res,`Marks are incomplete (${results.length}/${students.length})`,409);if(results.some(r=>r.resultStatus==='pending'))return bad(res,'Pending marks must be completed before verification',409);
  const now=new Date();await ExamResult.updateMany({collegeId:cid,scheduleId:schedule._id},{$set:{verifiedBy:req.user._id,verifiedAt:now}});schedule.marksVerifiedAt=now;schedule.marksVerifiedBy=req.user._id;await schedule.save();await audit(req,'VERIFY_EXAM_MARKS','ExamSchedule',schedule._id,{count:results.length});res.json({message:'Marks verified',count:results.length});
}
async function reopenMarks(req,res){
  const cid=collegeId(req),schedule=await ExamSchedule.findOne({_id:req.params.scheduleId,collegeId:cid});if(!schedule)return bad(res,'Schedule not found',404);const exam=await Exam.findOne({_id:schedule.examId,collegeId:cid});if(['compiled','published','closed'].includes(exam?.status))return bad(res,'Compiled/published exam cannot be reopened',409);
  await ExamResult.updateMany({collegeId:cid,scheduleId:schedule._id},{$set:{verifiedBy:null,verifiedAt:null}});schedule.marksVerifiedAt=null;schedule.marksVerifiedBy=null;await schedule.save();await audit(req,'REOPEN_EXAM_MARKS','ExamSchedule',schedule._id);res.json({message:'Marks reopened'});
}
async function compileExam(req,res){
  const cid=collegeId(req),exam=await Exam.findOne({_id:req.params.examId,collegeId:cid});if(!exam)return bad(res,'Exam not found',404);if(['published','closed'].includes(exam.status))return bad(res,'Exam is already published/closed',409);const schedules=await ExamSchedule.find({collegeId:cid,examId:exam._id}).select('_id sectionId academicSessionId marksVerifiedAt').lean();if(!schedules.length)return bad(res,'No Date Sheet entries found');

  // Compile validation used to execute two database queries for every paper.
  // Fetch the expected-student and entered-result counts in two grouped queries instead.
  const sectionIds=[...new Set(schedules.map(s=>toId(s.sectionId)).filter(Boolean))];
  const sessionIds=[...new Set(schedules.map(s=>toId(s.academicSessionId)).filter(Boolean))];
  const [studentCounts,resultCounts]=await Promise.all([
    Student.aggregate([
      {$match:{collegeId:cid,status:'active',sectionId:{$in:sectionIds.map(id=>new Student.db.base.Types.ObjectId(id))},academicSessionId:{$in:sessionIds.map(id=>new Student.db.base.Types.ObjectId(id))}}},
      {$group:{_id:{sectionId:'$sectionId',academicSessionId:'$academicSessionId'},count:{$sum:1}}}
    ]),
    ExamResult.aggregate([
      {$match:{collegeId:cid,scheduleId:{$in:schedules.map(s=>s._id)},resultStatus:{$ne:'pending'}}},
      {$group:{_id:'$scheduleId',count:{$sum:1}}}
    ])
  ]);
  const expectedByClass=new Map(studentCounts.map(x=>[`${toId(x._id.sectionId)}:${toId(x._id.academicSessionId)}`,x.count]));
  const enteredBySchedule=new Map(resultCounts.map(x=>[toId(x._id),x.count]));
  const incomplete=[];
  for(const s of schedules){
    const expected=expectedByClass.get(`${toId(s.sectionId)}:${toId(s.academicSessionId)}`)||0;
    const actual=enteredBySchedule.get(toId(s._id))||0;
    if(actual<expected||!s.marksVerifiedAt)incomplete.push({scheduleId:s._id,expected,entered:actual,verified:!!s.marksVerifiedAt});
  }
  if(incomplete.length)return bad(res,'All papers must have complete and verified marks before compilation',409,{incomplete});exam.status='compiled';await exam.save();await audit(req,'COMPILE_EXAM_RESULTS','Exam',exam._id);res.json({message:'Results compiled',exam});
}
async function publishResults(req,res){const cid=collegeId(req),exam=await Exam.findOne({_id:req.params.examId,collegeId:cid});if(!exam)return bad(res,'Exam not found',404);if(exam.status!=='compiled')return bad(res,'Compile results before publication',409);const now=new Date();await ExamResult.updateMany({collegeId:cid,examId:exam._id},{$set:{publishedAt:now}});await ExamSchedule.updateMany({collegeId:cid,examId:exam._id},{$set:{isPublished:true}});exam.status='published';exam.publishedAt=now;exam.publishedBy=req.user._id;await exam.save();await audit(req,'PUBLISH_EXAM_RESULTS','Exam',exam._id);res.json({message:'Results published',exam});}

async function listResults(req,res){
  const cid=collegeId(req),q={collegeId:cid};if(req.query.examId)q.examId=req.query.examId;if(req.query.studentId)q.studentId=req.query.studentId;if(req.query.sectionId)q.sectionId=req.query.sectionId;
  if(scope.isStudentUser(req.user)){q.studentId=req.user.linkedStudentId;q.publishedAt={$ne:null};}else if(scope.isTeacherUser(req.user)){const assignments=await scope.teacherAssignments(req.user,cid);if(!assignments.length)return res.json([]);q.$or=teacherResultPairs(assignments);}
  const docs=await ExamResult.find(q).populate('examId','name status publishedAt academicSessionId').populate('studentId','name fatherName admissionNo registrationNo rollNo programId sectionId academicSessionId').populate('sectionId','name').populate('courseId','name code creditHours periodNumber').sort({studentId:1,courseId:1});res.json(docs);
}
async function resultCard(req,res){
  const cid=collegeId(req),studentId=req.params.studentId;if(scope.isStudentUser(req.user)&&toId(studentId)!==toId(req.user.linkedStudentId))return bad(res,'Access denied',403);const student=await Student.findOne({_id:studentId,collegeId:cid}).populate('programId sectionId academicSessionId').lean();if(!student)return bad(res,'Student not found',404);const exam=await Exam.findOne({_id:req.params.examId,collegeId:cid}).populate('academicSessionId examTypeId gradingSchemeId').lean();if(!exam)return bad(res,'Exam not found',404);if(scope.isStudentUser(req.user)&&exam.status!=='published')return bad(res,'Result not published',403);
  const resultQ={collegeId:cid,examId:exam._id,studentId};
  if(scope.isTeacherUser(req.user)){const assignments=await scope.teacherAssignments(req.user,cid);const own=assignments.filter(a=>toId(a.sectionId)===toId(student.sectionId));if(!own.length)return bad(res,'This student is not in one of your assigned classes',403);resultQ.$or=teacherResultPairs(own);}
  const results=await ExamResult.find(resultQ).populate('courseId','name code creditHours periodNumber').lean();const counted=results.filter(r=>!['withheld'].includes(r.resultStatus)),total=counted.reduce((s,r)=>s+Number(r.totalMarks||0),0),obtained=counted.reduce((s,r)=>s+Number(r.marksObtained||0),0),credits=counted.reduce((s,r)=>s+Number(r.courseId?.creditHours||0),0),quality=counted.reduce((s,r)=>s+Number(r.gradePoint||0)*Number(r.courseId?.creditHours||0),0),percentage=total?Number((obtained/total*100).toFixed(2)):0,gpa=credits?Number((quality/credits).toFixed(2)):0,failed=counted.some(r=>['fail','absent'].includes(r.resultStatus));res.json({student,exam,results,summary:{totalMarks:total,obtainedMarks:obtained,percentage,gpa,overallStatus:failed?'FAIL':'PASS'}});
}
async function transcript(req,res){const cid=collegeId(req),studentId=req.params.studentId;if(scope.isStudentUser(req.user)&&toId(studentId)!==toId(req.user.linkedStudentId))return bad(res,'Access denied',403);const student=await Student.findOne({_id:studentId,collegeId:cid}).populate('programId').lean();if(!student)return bad(res,'Student not found',404);const q={collegeId:cid,studentId,publishedAt:{$ne:null}};if(scope.isTeacherUser(req.user)){const assignments=await scope.teacherAssignments(req.user,cid);const own=assignments.filter(a=>toId(a.sectionId)===toId(student.sectionId));if(!own.length)return bad(res,'This student is not in one of your assigned classes',403);q.$or=teacherResultPairs(own);}const results=await ExamResult.find(q).populate('examId','name academicSessionId publishedAt').populate('courseId','name code creditHours periodNumber').lean();const grouped={};for(const r of results){const key=toId(r.examId?._id);if(!grouped[key])grouped[key]={exam:r.examId,results:[]};grouped[key].results.push(r);}res.json({student,exams:Object.values(grouped)});}

module.exports={listExamTypes,createExamType,updateExamType,listGradingSchemes,createGradingScheme,updateGradingScheme,listExams,createExam,updateExam,deleteExam,listSchedules,createSchedule,createSchedulesBatch,updateSchedule,deleteSchedule,publishSchedule,publishDateSheet,roster,saveMarks,verifyMarks,reopenMarks,compileExam,publishResults,listResults,resultCard,transcript};
