const Student = require('../../models/Student');
const Attendance = require('../../models/Attendance');
const Timetable = require('../../models/Timetable');
const StudentFeePlan = require('../../models/StudentFeePlan');
const FeePosting = require('../../models/FeePosting');
const FeePayment = require('../../models/FeePayment');
const Exam = require('../../models/Exam');
const ExamResult = require('../../models/ExamResult');
const LibraryBook = require('../../models/LibraryBook');
const LibraryBookCopy = require('../../models/LibraryBookCopy');
const LibraryIssue = require('../../models/LibraryIssue');
const LibraryReservation = require('../../models/LibraryReservation');
const Notice = require('../../models/Notice');
const Notification = require('../../models/Notification');
const Event = require('../../models/Event');
const EventRegistration = require('../../models/EventRegistration');
const Program = require('../../models/Program');
const Employee = require('../../models/Employee');
const TeacherAssignment = require('../../models/TeacherAssignment');
const Section = require('../../models/Section');
const AttendanceSession = require('../../models/AttendanceSession');
const ExamSchedule = require('../../models/ExamSchedule');
const GradingScheme = require('../../models/GradingScheme');
const attendanceService = require('../attendance/service');

function id(value) { return value ? String(value._id || value) : ''; }
function money(value) { return Number(Number(value || 0).toFixed(2)); }

async function requireStudent(req, { allowSuspended = false } = {}) {
  if (!req.user?.linkedStudentId) {
    const err = new Error('This account is not linked to a student profile'); err.status = 403; throw err;
  }
  const student = await Student.findOne(req.tenantFilter({ _id: req.user.linkedStudentId }))
    .select('_id status rollNo admissionApplicationId academicSessionId programId sectionId currentPeriod currentSemester suspensionReason suspendedAt suspensionUntil reactivationInstructions')
    .lean();
  if (!student) { const err = new Error('Student profile not found'); err.status = 404; throw err; }
  if (student.status === 'suspended' && !allowSuspended) {
    const err = new Error('Student account is suspended'); err.status = 403; err.code = 'STUDENT_SUSPENDED';
    err.portalAccess = { state:'suspended', rollNo:student.rollNo||'', reason:student.suspensionReason||'', suspendedAt:student.suspendedAt||null, suspensionUntil:student.suspensionUntil||null, reactivationInstructions:student.reactivationInstructions||'Contact college administration for reactivation procedure.' };
    throw err;
  }
  if (student.status !== 'active' && student.status !== 'suspended') {
    const err = new Error('Student portal access is inactive'); err.status = 403; err.code = 'STUDENT_INACTIVE'; throw err;
  }
  return student;
}

exports.me = async (req,res) => {
  const studentId=req.user?.linkedStudentId?String(req.user.linkedStudentId):null;
  const employeeId=req.user?.linkedEmployeeId?String(req.user.linkedEmployeeId):null;
  res.json({user:{id:req.user._id,name:req.user.name,email:req.user.emailIsSynthetic?'':req.user.email,cnic:req.user.cnic||'',loginRollNo:req.user.loginRollNo||'',collegeId:req.user.collegeId,roles:(req.user.roleIds||[]).map(r=>({id:r._id,name:r.name,code:r.code})),linkedStudentId:studentId,linkedEmployeeId:employeeId,mustChangePassword:Boolean(req.user.mustChangePassword)}});
};

exports.studentProfile = async (req,res) => {
  const access=await requireStudent(req); const studentId=String(access._id);
  const student=await Student.findOne(req.tenantFilter({_id:studentId})).populate('programId','name code academicSystem academicType').populate('sectionId','name periodNumber genderType').populate('academicSessionId','name startDate endDate isCurrent').lean();
  if(!student)return res.status(404).json({error:'Student profile not found'});
  res.json({student:{id:student._id,admissionNo:student.admissionNo,registrationNo:student.registrationNo||'',rollNo:student.rollNo||'',name:student.name,fatherName:student.fatherName||'',guardianName:student.guardianName||'',phone:student.phone||'',email:student.email||'',dateOfBirth:student.dateOfBirth||null,gender:student.gender||'',address:student.address||'',photoUrl:student.photoUrl||'',admissionDate:student.admissionDate||null,admissionStanding:student.admissionStanding,status:student.status,currentPeriod:student.currentPeriod||student.currentSemester||1,program:student.programId||null,section:student.sectionId||null,academicSession:student.academicSessionId||null}});
};

exports.studentAttendance = async (req,res) => {
  const access=await requireStudent(req); const studentId=String(access._id);
  const student=await Student.findOne(req.tenantFilter({_id:studentId})).select('_id sectionId academicSessionId').lean();
  if(!student)return res.status(404).json({error:'Student profile not found'});
  const rows=await Attendance.find(req.tenantFilter({studentId:student._id,...(student.academicSessionId?{academicSessionId:student.academicSessionId}:{})})).populate('courseId','name code').sort({attendanceDate:-1,scheduledStartMinutes:-1}).limit(250).lean();
  const counts={total:rows.length,present:0,late:0,absent:0,leave:0,excused:0},byCourse={};
  for(const row of rows){const status=row.status||'';if(status==='present')counts.present++;else if(status==='late')counts.late++;else if(status==='absent')counts.absent++;else if(status==='leave'||status==='short_leave')counts.leave++;else if(status==='excused')counts.excused++;const key=id(row.courseId)||'general';if(!byCourse[key])byCourse[key]={course:row.courseId?{id:row.courseId._id,name:row.courseId.name,code:row.courseId.code}:null,total:0,attended:0,absent:0};byCourse[key].total++;if(status==='present'||status==='late')byCourse[key].attended++;if(status==='absent')byCourse[key].absent++;}
  counts.attended=counts.present+counts.late;counts.percentage=counts.total?Math.round(counts.attended/counts.total*1000)/10:null;
  res.json({summary:counts,subjects:Object.values(byCourse).map(x=>({...x,percentage:x.total?Math.round(x.attended/x.total*1000)/10:null})),recent:rows.slice(0,30).map(row=>({id:row._id,date:row.attendanceDate,status:row.status,course:row.courseId?{id:row.courseId._id,name:row.courseId.name,code:row.courseId.code}:null,startMinutes:row.scheduledStartMinutes,endMinutes:row.scheduledEndMinutes}))});
};

exports.studentTimetable = async (req,res) => {
  const access=await requireStudent(req); const studentId=String(access._id);
  const student=await Student.findOne(req.tenantFilter({_id:studentId})).select('_id sectionId academicSessionId').lean();
  if(!student)return res.status(404).json({error:'Student profile not found'});if(!student.sectionId)return res.json({timetable:[]});
  const rows=await Timetable.find(req.tenantFilter({sectionId:student.sectionId,...(student.academicSessionId?{academicSessionId:student.academicSessionId}:{}),isActive:true,generationStatus:'published'})).populate('courseId','name code').populate('teacherId','name employeeNo').populate('sectionId','name periodNumber genderType').sort({dayOfWeek:1,startMinutes:1}).lean();
  res.json({timetable:rows.map(row=>({id:row._id,dayOfWeek:row.dayOfWeek,startMinutes:row.startMinutes,endMinutes:row.endMinutes,room:row.room||'',course:row.courseId||null,teacher:row.teacherId||null,section:row.sectionId||null,divisionId:row.divisionId||null}))});
};

exports.studentFees = async (req,res) => {
  const student=await requireStudent(req);
  if(!student.admissionApplicationId)return res.json({plan:null,summary:{totalAmount:0,totalPaid:0,balance:0,openBalance:0,advanceCredit:0},vouchers:[],payments:[]});
  const plan=await StudentFeePlan.findOne(req.tenantFilter({admissionApplicationId:student.admissionApplicationId})).populate('feeStructureId','name billingCycle version').lean();
  if(!plan)return res.json({plan:null,summary:{totalAmount:0,totalPaid:0,balance:0,openBalance:0,advanceCredit:0},vouchers:[],payments:[]});
  const [postings,payments]=await Promise.all([
    FeePosting.find(req.tenantFilter({studentFeePlanId:plan._id,status:{$ne:'cancelled'}})).sort({postingDate:-1,createdAt:-1}).lean(),
    FeePayment.find(req.tenantFilter({studentFeePlanId:plan._id,isReversed:false})).sort({paymentDate:-1,createdAt:-1}).lean()
  ]);
  const vouchers=postings.map(p=>{const linePaid=(p.lines||[]).reduce((s,x)=>s+Number(x.paidAmount||0)+Number(x.advanceApplied||0),0);const outstanding=Math.max(0,Number(p.voucherAmount||0)-linePaid);return {id:p._id,voucherNo:p.voucherNo||'',voucherType:p.voucherType||'bank',postingDate:p.postingDate||p.createdAt,dueDate:p.dueDate||null,periodKey:p.periodKey||'',amount:money(p.voucherAmount),paidAmount:money(linePaid),outstanding:money(outstanding),status:p.status||'unpaid',lines:(p.lines||[]).map(x=>({feeHeadCode:x.feeHeadCode,description:x.description,amount:money(x.amount),paidAmount:money(x.paidAmount)})),arrearsAmount:money(p.arrearsAmount)};});
  const openBalance=money(vouchers.reduce((s,v)=>s+v.outstanding,0));
  res.json({plan:{id:plan._id,billingCycle:plan.billingCycle,totalAmount:money(plan.totalAmount),totalPosted:money(plan.totalPosted),totalPaid:money(plan.totalPaid),balance:money(plan.balance),advanceCredit:money(plan.advanceCredit),status:plan.status,feeStructure:plan.feeStructureId||null,installments:(plan.installments||[]).map(i=>({id:i._id,title:i.title,amount:money(i.amount),paidAmount:money(i.paidAmount),dueDate:i.dueDate,sequence:i.sequence}))},summary:{totalAmount:money(plan.totalAmount),totalPosted:money(plan.totalPosted),totalPaid:money(plan.totalPaid),balance:money(plan.balance),openBalance,advanceCredit:money(plan.advanceCredit)},vouchers,payments:payments.map(p=>({id:p._id,receiptNo:p.receiptNo||'',amount:money(p.amount),paymentDate:p.paymentDate,paymentMethod:p.paymentMethod||'',challanNo:p.challanNo||p.referenceNo||''}))});
};

exports.studentResults = async (req,res) => {
  const student=await requireStudent(req);
  const results=await ExamResult.find(req.tenantFilter({studentId:student._id,publishedAt:{$ne:null}})).populate('examId','name code status startDate endDate publishedAt academicSessionId').populate('courseId','name code creditHours periodNumber').sort({publishedAt:-1,createdAt:-1}).lean();
  const grouped=new Map();
  for(const r of results){const examId=id(r.examId);if(!examId)continue;if(!grouped.has(examId))grouped.set(examId,{exam:r.examId,results:[]});grouped.get(examId).results.push(r);}
  const exams=[];
  for(const group of grouped.values()){
    const counted=group.results.filter(r=>r.resultStatus!=='withheld');const total=counted.reduce((s,r)=>s+Number(r.totalMarks||0),0);const obtained=counted.reduce((s,r)=>s+Number(r.marksObtained||0),0);const credits=counted.reduce((s,r)=>s+Number(r.courseId?.creditHours||0),0);const quality=counted.reduce((s,r)=>s+Number(r.gradePoint||0)*Number(r.courseId?.creditHours||0),0);const failed=counted.some(r=>['fail','absent'].includes(r.resultStatus));
    exams.push({exam:group.exam,summary:{totalMarks:total,obtainedMarks:obtained,percentage:total?Number((obtained/total*100).toFixed(2)):0,gpa:credits?Number((quality/credits).toFixed(2)):0,overallStatus:failed?'FAIL':'PASS'},results:group.results.map(r=>({id:r._id,course:r.courseId||null,marksObtained:r.marksObtained,totalMarks:r.totalMarks,percentage:r.percentage,grade:r.grade||'',gradePoint:r.gradePoint,resultStatus:r.resultStatus,remarks:r.remarks||''}))});
  }
  res.json({exams});
};

exports.studentLibrary = async (req,res) => {
  const student=await requireStudent(req);
  const [issues,reservations]=await Promise.all([
    LibraryIssue.find(req.tenantFilter({studentId:student._id})).populate('bookId','title isbn authors').populate('copyId','accessionNo').sort({issuedAt:-1}).lean(),
    LibraryReservation.find(req.tenantFilter({studentId:student._id})).populate('bookId','title isbn authors').populate('readyCopyId','accessionNo').sort({requestedAt:-1}).lean()
  ]);
  const now=Date.now();
  res.json({issues:issues.map(x=>({id:x._id,book:x.bookId||null,copy:x.copyId||null,issuedAt:x.issuedAt,dueAt:x.dueAt,returnedAt:x.returnedAt||null,status:x.status,renewalCount:x.renewalCount||0,fineAmount:money(x.fineAmount),finePaid:money(x.finePaid),fineWaived:money(x.fineWaived),fineStatus:x.fineStatus,isOverdue:['issued','overdue'].includes(x.status)&&x.dueAt&&new Date(x.dueAt).getTime()<now})),reservations:reservations.map(x=>({id:x._id,book:x.bookId||null,requestedAt:x.requestedAt,expiresAt:x.expiresAt||null,status:x.status,readyCopy:x.readyCopyId||null}))});
};

exports.studentLibraryCatalog = async (req,res) => {
  await requireStudent(req);
  const search=String(req.query.search||'').trim();const q=req.tenantFilter({isActive:true});
  if(search){const escaped=search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const rx=new RegExp(escaped,'i');q.$or=[{bookCode:rx},{title:rx},{isbn:rx},{authors:rx},{category:rx}];}
  const books=await LibraryBook.find(q).sort({title:1}).limit(100).lean();
  const counts=books.length?await LibraryBookCopy.aggregate([{$match:{collegeId:books[0].collegeId,bookId:{$in:books.map(b=>b._id)}}},{$group:{_id:'$bookId',total:{$sum:1},available:{$sum:{$cond:[{$eq:['$status','available']},1,0]}}}}]):[];
  const map=new Map(counts.map(x=>[String(x._id),x]));res.json({books:books.map(b=>({...b,copies:map.get(String(b._id))||{total:0,available:0}}))});
};


function sameId(a,b){ return String(a?._id||a||'') === String(b?._id||b||''); }

async function studentAudienceContext(req) {
  const student = await requireStudent(req);
  let program = null;
  if (student.programId) {
    program = await Program.findOne(req.tenantFilter({ _id: student.programId })).select('_id branchId').lean();
  }
  return { student, program };
}

function visibleStudentAudience(doc, student, program) {
  const audience = doc.audience || doc.audienceType || 'all';
  if (!['all','students','program','section'].includes(audience)) return false;

  if (doc.academicSessionId && !sameId(doc.academicSessionId, student.academicSessionId)) return false;

  if (doc.branchId && ['students','program','section'].includes(audience)) {
    if (!program?.branchId || !sameId(doc.branchId, program.branchId)) return false;
  }

  if (audience === 'program') {
    return (doc.targetProgramIds || []).some(x => sameId(x, student.programId));
  }
  if (audience === 'section') {
    return (doc.targetSectionIds || []).some(x => sameId(x, student.sectionId));
  }
  return true;
}

exports.studentNotices = async (req,res) => {
  const { student, program } = await studentAudienceContext(req);
  const now = new Date();

  const docs = await Notice.find(req.tenantFilter({
    status:'published',
    publishAt:{$lte:now},
    $or:[{expireAt:null},{expireAt:{$exists:false}},{expireAt:{$gte:now}}]
  }))
    .populate('categoryId','name')
    .sort({publishAt:-1,createdAt:-1})
    .lean();

  const visible = docs.filter(n => visibleStudentAudience(n, student, program));
  const ids = visible.map(n => n._id);

  const notifications = ids.length ? await Notification.find(req.tenantFilter({
    userId:req.user._id,
    type:'notice',
    entityId:{$in:ids}
  })).select('entityId isRead readAt').lean() : [];

  const readMap = new Map(notifications.map(n => [String(n.entityId), n]));

  res.json({
    notices: visible.map(n => {
      const state = readMap.get(String(n._id));
      return {
        id:n._id,
        noticeNo:n.noticeNo||'',
        title:n.title,
        body:n.body,
        category:n.categoryId||null,
        priority:n.priority||'normal',
        publishAt:n.publishAt,
        expireAt:n.expireAt||null,
        attachmentUrl:n.attachmentUrl||'',
        attachmentName:n.attachmentName||'',
        isRead:Boolean(state?.isRead),
        readAt:state?.readAt||null
      };
    })
  });
};

exports.markStudentNoticeRead = async (req,res) => {
  const { student, program } = await studentAudienceContext(req);
  const now = new Date();
  const notice = await Notice.findOne(req.tenantFilter({
    _id:req.params.id,
    status:'published',
    publishAt:{$lte:now},
    $or:[{expireAt:null},{expireAt:{$exists:false}},{expireAt:{$gte:now}}]
  })).lean();

  if (!notice || !visibleStudentAudience(notice, student, program)) {
    return res.status(404).json({error:'Notice not found'});
  }

  const notification = await Notification.findOneAndUpdate(
    req.tenantFilter({userId:req.user._id,type:'notice',entityId:notice._id}),
    {
      $set:{isRead:true,readAt:now},
      $setOnInsert:{
        userId:req.user._id,
        type:'notice',
        title:notice.title,
        message:notice.body,
        entityType:'Notice',
        entityId:notice._id
      }
    },
    {new:true,upsert:true,setDefaultsOnInsert:true}
  );

  res.json({ok:true,isRead:true,readAt:notification.readAt});
};

exports.studentEvents = async (req,res) => {
  const { student, program } = await studentAudienceContext(req);
  const now = new Date();

  await Event.updateMany(
    req.tenantFilter({status:'scheduled',startAt:{$lte:now},endAt:{$gte:now}}),
    {$set:{status:'active'}}
  );
  await Event.updateMany(
    req.tenantFilter({status:{$in:['scheduled','active','published']},endAt:{$lt:now}}),
    {$set:{status:'completed'}}
  );

  const docs = await Event.find(req.tenantFilter({
    status:{$in:['scheduled','active','published']},
    endAt:{$gte:now}
  }))
    .populate('organizerEmployeeId','name employeeNo employeeCode')
    .sort({startAt:1})
    .lean();

  const visible = docs.filter(e => visibleStudentAudience({
    ...e,
    audience:e.audienceType || 'all'
  }, student, program));

  const ids = visible.map(e => e._id);
  const registrations = ids.length ? await EventRegistration.find(req.tenantFilter({
    eventId:{$in:ids},
    studentId:student._id,
    status:{$ne:'cancelled'}
  })).lean() : [];
  const registrationMap = new Map(registrations.map(r => [String(r.eventId),r]));

  res.json({
    events: visible.map(e => {
      const registration = registrationMap.get(String(e._id));
      return {
        id:e._id,
        eventNo:e.eventNo||'',
        title:e.title,
        category:e.category||'other',
        description:e.description||'',
        venue:e.venue||'',
        startAt:e.startAt,
        endAt:e.endAt,
        priority:e.priority||'normal',
        status:e.status,
        registrationRequired:Boolean(e.registrationRequired),
        capacity:Number(e.capacity||0),
        attachmentUrl:e.attachmentUrl||'',
        attachmentName:e.attachmentName||'',
        organizer:e.organizerEmployeeId||null,
        registration:registration ? {
          id:registration._id,
          status:registration.status,
          registeredAt:registration.registeredAt
        } : null
      };
    })
  });
};

exports.registerStudentEvent = async (req,res) => {
  const { student, program } = await studentAudienceContext(req);
  const now = new Date();
  const event = await Event.findOne(req.tenantFilter({
    _id:req.params.id,
    status:{$in:['scheduled','active','published']},
    endAt:{$gte:now}
  })).lean();

  if (!event || !visibleStudentAudience({...event,audience:event.audienceType||'all'},student,program)) {
    return res.status(404).json({error:'Event not found'});
  }
  if (!event.registrationRequired) {
    return res.status(400).json({error:'Registration is not required for this event'});
  }

  if (event.capacity > 0) {
    const count = await EventRegistration.countDocuments(req.tenantFilter({
      eventId:event._id,
      status:'registered'
    }));
    if (count >= event.capacity) return res.status(409).json({error:'Event capacity reached'});
  }

  let existing = await EventRegistration.findOne(req.tenantFilter({
    eventId:event._id,
    studentId:student._id
  }));

  if (existing) {
    if (existing.status !== 'cancelled') return res.status(409).json({error:'Already registered for this event'});
    existing.status='registered';
    existing.registeredAt=new Date();
    existing.checkedInAt=null;
    await existing.save();
    return res.json({registration:existing});
  }

  const registration = await EventRegistration.create({
    collegeId:req.collegeId||req.user.collegeId,
    eventId:event._id,
    participantType:'student',
    studentId:student._id,
    status:'registered'
  });
  res.status(201).json({registration});
};


function userHasRole(req, code) {
  return (req.user?.roleIds || []).some(r => String(r?.code || r?.name || '').toLowerCase() === String(code).toLowerCase());
}

async function requireTeacher(req) {
  if (!userHasRole(req, 'teacher')) {
    const err = new Error('Teacher role is required'); err.status = 403; err.code = 'TEACHER_REQUIRED'; throw err;
  }
  if (!req.user?.linkedEmployeeId) {
    const err = new Error('This teacher account is not linked to an employee profile'); err.status = 403; err.code = 'TEACHER_PROFILE_NOT_LINKED'; throw err;
  }

  const employee = await Employee.findOne(req.tenantFilter({ _id:req.user.linkedEmployeeId }))
    .select('_id employeeNo employeeCode name category branchId designationId subjectId isActive')
    .lean();

  if (!employee) {
    const err = new Error('Teacher employee profile not found'); err.status = 404; err.code = 'TEACHER_PROFILE_NOT_FOUND'; throw err;
  }
  if (!employee.isActive) {
    const err = new Error('Teacher account is inactive'); err.status = 403; err.code = 'TEACHER_INACTIVE'; throw err;
  }
  if (employee.category !== 'academic_staff') {
    const err = new Error('Teacher role is not linked to academic staff'); err.status = 403; err.code = 'TEACHER_INVALID_PROFILE'; throw err;
  }
  return employee;
}

function teacherAssignmentFilter(req, teacherId) {
  const now = new Date();
  return req.tenantFilter({
    teacherId,
    isActive:true,
    $and:[
      {$or:[{startsOn:null},{startsOn:{$exists:false}},{startsOn:{$lte:now}}]},
      {$or:[{endsOn:null},{endsOn:{$exists:false}},{endsOn:{$gte:now}}]}
    ]
  });
}

exports.teacherProfile = async (req,res) => {
  const access = await requireTeacher(req);
  const employee = await Employee.findOne(req.tenantFilter({_id:access._id}))
    .populate('designationId','name code')
    .populate('branchId','name code')
    .populate('subjectId','name code')
    .lean();

  const assignmentCount = await TeacherAssignment.countDocuments(teacherAssignmentFilter(req, access._id));

  res.json({
    teacher:{
      id:employee._id,
      employeeNo:employee.employeeNo||employee.employeeCode||'',
      employeeCode:employee.employeeCode||employee.employeeNo||'',
      name:employee.name,
      fatherName:employee.fatherName||'',
      cnic:employee.cnic||'',
      qualification:employee.qualification||'',
      mobileNo:employee.mobileNo||employee.phone||'',
      email:employee.email||'',
      address:employee.address||'',
      dateOfBirth:employee.dateOfBirth||employee.dob||null,
      dateOfJoining:employee.dateOfJoining||employee.joiningDate||null,
      photoUrl:employee.photoUrl||'',
      category:employee.category,
      designation:employee.designationId||null,
      branch:employee.branchId||null,
      primarySubject:employee.subjectId||null,
      activeAssignments:assignmentCount
    }
  });
};

exports.teacherDashboard = async (req,res) => {
  const teacher = await requireTeacher(req);
  const dayOfWeek = new Date().getDay();

  const [assignments,todayRows] = await Promise.all([
    TeacherAssignment.find(teacherAssignmentFilter(req,teacher._id))
      .populate('programId','name code')
      .populate('sectionId','name periodNumber genderType')
      .populate('courseId','name code')
      .populate('academicSessionId','name isCurrent')
      .sort({createdAt:1})
      .lean(),
    Timetable.find(req.tenantFilter({
      teacherId:teacher._id,
      isActive:true,
      generationStatus:'published',
      dayOfWeek
    }))
      .populate('courseId','name code')
      .populate('sectionId','name periodNumber genderType')
      .populate('academicSessionId','name isCurrent')
      .sort({startMinutes:1})
      .lean()
  ]);

  const sectionIds=[...new Set(assignments.map(x=>id(x.sectionId)).filter(Boolean))];
  const studentCounts=sectionIds.length ? await Student.aggregate([
    {$match:req.tenantFilter({sectionId:{$in:sectionIds.map(x=>new (require('mongoose').Types.ObjectId)(x))},status:'active'})},
    {$group:{_id:'$sectionId',count:{$sum:1}}}
  ]) : [];
  const countMap=new Map(studentCounts.map(x=>[String(x._id),x.count]));

  res.json({
    summary:{
      activeAssignments:assignments.length,
      classesToday:todayRows.length,
      sections:sectionIds.length,
      students:sectionIds.reduce((sum,x)=>sum+(countMap.get(x)||0),0)
    },
    today:todayRows.map(row=>({
      id:row._id,
      dayOfWeek:row.dayOfWeek,
      startMinutes:row.startMinutes,
      endMinutes:row.endMinutes,
      room:row.room||'',
      course:row.courseId||null,
      section:row.sectionId||null,
      academicSession:row.academicSessionId||null
    }))
  });
};

exports.teacherTimetable = async (req,res) => {
  const teacher = await requireTeacher(req);
  const rows = await Timetable.find(req.tenantFilter({
    teacherId:teacher._id,
    isActive:true,
    generationStatus:'published'
  }))
    .populate('courseId','name code')
    .populate('sectionId','name periodNumber genderType')
    .populate('academicSessionId','name isCurrent')
    .sort({dayOfWeek:1,startMinutes:1})
    .lean();

  res.json({timetable:rows.map(row=>({
    id:row._id,
    dayOfWeek:row.dayOfWeek,
    startMinutes:row.startMinutes,
    endMinutes:row.endMinutes,
    room:row.room||'',
    course:row.courseId||null,
    section:row.sectionId||null,
    academicSession:row.academicSessionId||null
  }))});
};

exports.teacherClasses = async (req,res) => {
  const teacher = await requireTeacher(req);
  const assignments = await TeacherAssignment.find(teacherAssignmentFilter(req,teacher._id))
    .populate('academicSessionId','name isCurrent')
    .populate('programId','name code')
    .populate('sectionId','name periodNumber genderType')
    .populate('courseId','name code courseType')
    .sort({academicSessionId:1,programId:1,sectionId:1,courseId:1})
    .lean();

  const sectionIds=[...new Set(assignments.map(x=>id(x.sectionId)).filter(Boolean))];
  const studentCounts=sectionIds.length ? await Student.aggregate([
    {$match:req.tenantFilter({sectionId:{$in:sectionIds.map(x=>new (require('mongoose').Types.ObjectId)(x))},status:'active'})},
    {$group:{_id:'$sectionId',count:{$sum:1}}}
  ]) : [];
  const countMap=new Map(studentCounts.map(x=>[String(x._id),x.count]));

  res.json({classes:assignments.map(a=>({
    id:a._id,
    academicSession:a.academicSessionId||null,
    program:a.programId||null,
    section:a.sectionId||null,
    course:a.courseId||null,
    periodNumber:a.periodNumber||a.semester||1,
    weeklyPeriods:a.weeklyPeriods||0,
    preferredRoom:a.preferredRoom||'',
    studentCount:countMap.get(id(a.sectionId))||0
  }))});
};

exports.teacherClassStudents = async (req,res) => {
  const teacher = await requireTeacher(req);
  const assignment = await TeacherAssignment.findOne({
    ...teacherAssignmentFilter(req,teacher._id),
    _id:req.params.assignmentId
  })
    .populate('academicSessionId','name isCurrent')
    .populate('programId','name code')
    .populate('sectionId','name periodNumber genderType')
    .populate('courseId','name code')
    .lean();

  if(!assignment) return res.status(404).json({error:'Assigned class not found'});

  const students = await Student.find(req.tenantFilter({
    sectionId:assignment.sectionId._id,
    academicSessionId:assignment.academicSessionId._id,
    programId:assignment.programId._id,
    status:'active'
  }))
    .select('_id rollNo admissionNo name fatherName gender photoUrl')
    .sort({rollNo:1,name:1})
    .lean();

  res.json({
    class:{
      id:assignment._id,
      academicSession:assignment.academicSessionId,
      program:assignment.programId,
      section:assignment.sectionId,
      course:assignment.courseId
    },
    students:students.map(s=>({
      id:s._id,
      rollNo:s.rollNo||'',
      admissionNo:s.admissionNo||'',
      name:s.name,
      fatherName:s.fatherName||'',
      gender:s.gender||'',
      photoUrl:s.photoUrl||''
    }))
  });
};


function teacherSameId(a,b){ return String(a?._id||a||'') === String(b?._id||b||''); }
function teacherDayStart(value){
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) { const err=new Error('Invalid date'); err.status=400; throw err; }
  return new Date(d.getFullYear(),d.getMonth(),d.getDate());
}
function teacherClean(value){ return String(value ?? '').trim(); }

async function teacherCanMarkAttendanceContext(req, teacher, {sectionId,timetableId}) {
  // Resolve the section and its configured attendance rule first.
  let section = null;
  let timetable = null;

  if (timetableId) {
    timetable = await Timetable.findOne(req.tenantFilter({_id:timetableId,isActive:true})).lean();
    if (!timetable) return false;
    section = await Section.findOne(req.tenantFilter({_id:timetable.sectionId})).lean();
  } else if (sectionId) {
    section = await Section.findOne(req.tenantFilter({_id:sectionId})).lean();
  }

  if (!section) return false;

  const resolved = await attendanceService.resolveRuleForSection(
    req.collegeId||req.user.collegeId,
    section._id
  );
  const mode = resolved?.rule?.attendanceMode;

  // Per-period attendance: only the teacher assigned to that exact timetable period
  // can mark attendance. Being the class teacher alone is not enough.
  if (mode === 'per_period') {
    if (!timetable) return false;
    return teacherSameId(timetable.teacherId, teacher._id);
  }

  // Once / twice attendance: only the section's class teacher can mark it.
  // Subject teachers must not mark whole-class attendance in these modes.
  if (mode === 'once' || mode === 'twice') {
    if (timetableId) return false;
    return teacherSameId(section.classTeacherId, teacher._id);
  }

  return false;
}

exports.teacherAttendanceContexts = async (req,res) => {
  const teacher = await requireTeacher(req);
  const date = teacherDayStart(req.query.date);
  const day = date.getDay();

  const universitySections = await Timetable.find(req.tenantFilter({
    teacherId:teacher._id,dayOfWeek:day,isActive:true
  })).distinct('sectionId');

  const sections = await Section.find(req.tenantFilter({
    isActive:true,
    $or:[{classTeacherId:teacher._id},{_id:{$in:universitySections}}]
  }))
    .populate({path:'programId',populate:['branchId','wingId']})
    .populate('academicSessionId','name isCurrent')
    .sort({name:1})
    .lean();

  const contexts=[];
  for(const section of sections){
    const resolved=await attendanceService.resolveRuleForSection(req.collegeId||req.user.collegeId,section._id);
    const rule=resolved.rule, program=resolved.program;
    const closure=await attendanceService.findAttendanceClosure(req.collegeId||req.user.collegeId,date,{
      audience:'students',
      academicSessionId:section.academicSessionId?._id||section.academicSessionId,
      sectionId:section._id,
      programId:program._id,
      branchId:program.branchId,
      wingId:program.wingId
    });
    if(closure) continue;

    if(rule.attendanceMode==='per_period'){
      // Subject/period teacher: show only timetable periods assigned to this teacher.
      const rows=await Timetable.find(req.tenantFilter({
        sectionId:section._id,
        teacherId:teacher._id,
        dayOfWeek:day,
        isActive:true
      })).populate('courseId','name code').sort({startMinutes:1}).lean();

      rows.forEach(tt=>contexts.push({
        key:`period:${tt._id}`,
        type:'per_period',
        slotKey:`period:${tt._id}`,
        timetableId:tt._id,
        sectionId:section._id,
        section:{id:section._id,name:section.name,periodNumber:section.periodNumber,genderType:section.genderType},
        program:{id:program._id,name:program.name||'',academicType:program.academicType},
        academicSession:section.academicSessionId||null,
        course:tt.courseId||null,
        startMinutes:tt.startMinutes,
        endMinutes:tt.endMinutes,
        label:tt.courseId?.name||'Period'
      }));
      continue;
    }

    // Whole-class attendance (once/twice): only the designated class teacher.
    if(!['once','twice'].includes(rule.attendanceMode)) continue;
    if(!teacherSameId(section.classTeacherId,teacher._id)) continue;

    const slots=rule.attendanceMode==='twice'
      ? [
          {slotKey:'first_half',label:'First Session',startMinutes:rule.firstSessionStartMinutes},
          {slotKey:'second_half',label:'Second Session',startMinutes:rule.secondSessionStartMinutes}
        ]
      : [{slotKey:'daily',label:'Daily Attendance',startMinutes:rule.firstSessionStartMinutes}];

    slots.forEach(slot=>contexts.push({
      key:`${section._id}:${slot.slotKey}`,
      type:rule.attendanceMode,
      timetableId:null,
      sectionId:section._id,
      section:{id:section._id,name:section.name,periodNumber:section.periodNumber,genderType:section.genderType},
      program:{id:program._id,name:program.name||'',academicType:program.academicType},
      academicSession:section.academicSessionId||null,
      course:null,
      ...slot
    }));
  }

  res.json({date:date.toISOString(),contexts});
};

exports.teacherAttendanceRoster = async (req,res) => {
  const teacher=await requireTeacher(req);
  const allowed=await teacherCanMarkAttendanceContext(req,teacher,req.query);
  if(!allowed)return res.status(403).json({error:'You are not authorized to mark attendance for this class/section.'});

  const date=teacherDayStart(req.query.date);
  const data=await attendanceService.studentsForContext({
    collegeId:req.collegeId||req.user.collegeId,
    sectionId:req.query.sectionId,
    timetableId:req.query.timetableId||null,
    slotKey:req.query.slotKey,
    date
  });

  res.json({
    session:data.session?{
      id:data.session._id,
      status:data.session.status,
      attendanceMode:data.session.attendanceMode,
      slotKey:data.session.slotKey,
      finalizedAt:data.session.finalizedAt||null
    }:null,
    students:data.students.map(s=>{
      const row=data.attendanceByStudent[String(s._id)];
      return {
        id:s._id,
        name:s.name,
        rollNo:s.rollNo||'',
        admissionNo:s.admissionNo||'',
        fatherName:s.fatherName||'',
        attendance:row?{
          id:row._id,
          status:row.status,
          source:row.source,
          isFinalized:Boolean(row.isFinalized)
        }:null
      };
    })
  });
};

exports.teacherSubmitAttendance = async (req,res) => {
  const teacher=await requireTeacher(req);
  const allowed=await teacherCanMarkAttendanceContext(req,teacher,req.body);
  if(!allowed)return res.status(403).json({error:'You are not authorized to mark attendance for this class/section.'});

  const date=teacherDayStart(req.body.date);
  const entries=Array.isArray(req.body.entries)?req.body.entries:[];
  if(!entries.length)return res.status(400).json({error:'Attendance entries are required'});

  const rows=await attendanceService.upsertManualContext({
    collegeId:req.collegeId||req.user.collegeId,
    sectionId:req.body.sectionId,
    timetableId:req.body.timetableId||null,
    slotKey:req.body.slotKey,
    date,
    entries,
    markedBy:req.user._id
  });

  const session=await attendanceService.finalizeContext({
    collegeId:req.collegeId||req.user.collegeId,
    sectionId:req.body.sectionId,
    timetableId:req.body.timetableId||null,
    slotKey:req.body.slotKey,
    date,
    userId:req.user._id
  });

  res.json({
    message:'Attendance submitted',
    count:rows.length,
    session:{id:session._id,status:session.status,finalizedAt:session.finalizedAt||null}
  });
};

async function teacherOwnsExamSchedule(req,teacher,schedule){
  const filter=teacherAssignmentFilter(req,teacher._id);
  filter.sectionId=schedule.sectionId?._id||schedule.sectionId;
  filter.courseId=schedule.courseId?._id||schedule.courseId;
  filter.academicSessionId=schedule.academicSessionId?._id||schedule.academicSessionId;
  return Boolean(await TeacherAssignment.exists(filter));
}

async function teacherGradeScheme(req,exam){
  if(exam.gradingSchemeId){
    const scheme=await GradingScheme.findOne(req.tenantFilter({_id:exam.gradingSchemeId,isActive:true})).lean();
    if(scheme)return scheme;
  }
  return GradingScheme.findOne(req.tenantFilter({isDefault:true,isActive:true})).lean();
}
function teacherApplyGrade(scheme,percentage){
  const bands=[...(scheme?.bands||[])].sort((a,b)=>Number(b.minPercentage)-Number(a.minPercentage));
  const band=bands.find(b=>percentage>=Number(b.minPercentage)&&percentage<=Number(b.maxPercentage));
  return band?{grade:band.grade,gradePoint:Number(band.gradePoint||0),remarks:band.remarks||''}:{grade:'',gradePoint:0,remarks:''};
}

exports.teacherMarksPapers = async (req,res) => {
  const teacher=await requireTeacher(req);
  const assignments=await TeacherAssignment.find(teacherAssignmentFilter(req,teacher._id)).select('sectionId courseId academicSessionId').lean();
  if(!assignments.length)return res.json({papers:[]});

  const pairs=assignments.map(a=>({
    sectionId:a.sectionId,courseId:a.courseId,academicSessionId:a.academicSessionId
  }));

  const schedules=await ExamSchedule.find(req.tenantFilter({$or:pairs}))
    .populate('examId','name code status publishedAt gradingSchemeId')
    .populate('courseId','name code')
    .populate('sectionId','name periodNumber genderType')
    .populate('programId','name code')
    .populate('academicSessionId','name isCurrent')
    .sort({examDate:-1,startTime:1})
    .lean();

  res.json({papers:schedules.map(s=>({
    id:s._id,
    exam:s.examId||null,
    course:s.courseId||null,
    section:s.sectionId||null,
    program:s.programId||null,
    academicSession:s.academicSessionId||null,
    examDate:s.examDate,
    startTime:s.startTime,
    totalMarks:s.totalMarks,
    passingMarks:s.passingMarks,
    marksVerifiedAt:s.marksVerifiedAt||null,
    locked:Boolean(s.marksVerifiedAt)||['compiled','published','closed'].includes(String(s.examId?.status||'')),
    published:Boolean(s.isPublished)
  }))});
};

exports.teacherMarksRoster = async (req,res) => {
  const teacher=await requireTeacher(req);
  const schedule=await ExamSchedule.findOne(req.tenantFilter({_id:req.params.scheduleId}))
    .populate('examId','name code status gradingSchemeId')
    .populate('courseId','name code')
    .populate('sectionId','name')
    .populate('programId','name code')
    .lean();
  if(!schedule)return res.status(404).json({error:'Exam paper not found'});
  if(!(await teacherOwnsExamSchedule(req,teacher,schedule)))return res.status(403).json({error:'You are not assigned to this course/section'});

  const students=await Student.find(req.tenantFilter({
    sectionId:schedule.sectionId._id,
    academicSessionId:schedule.academicSessionId,
    programId:schedule.programId._id,
    status:'active'
  })).select('_id rollNo admissionNo name fatherName').sort({rollNo:1,name:1}).lean();

  const existing=await ExamResult.find(req.tenantFilter({scheduleId:schedule._id})).lean();
  const resultMap=new Map(existing.map(r=>[String(r.studentId),r]));

  res.json({
    paper:{
      id:schedule._id,
      exam:schedule.examId||null,
      course:schedule.courseId||null,
      section:schedule.sectionId||null,
      program:schedule.programId||null,
      totalMarks:schedule.totalMarks,
      passingMarks:schedule.passingMarks,
      marksVerifiedAt:schedule.marksVerifiedAt||null,
      locked:Boolean(schedule.marksVerifiedAt)||['compiled','published','closed'].includes(String(schedule.examId?.status||''))
    },
    students:students.map(s=>{
      const r=resultMap.get(String(s._id));
      return {
        id:s._id,
        rollNo:s.rollNo||'',
        admissionNo:s.admissionNo||'',
        name:s.name,
        fatherName:s.fatherName||'',
        result:r?{
          marksObtained:r.marksObtained,
          resultStatus:r.resultStatus,
          grade:r.grade||'',
          remarks:r.remarks||''
        }:null
      };
    })
  });
};

exports.teacherSaveMarks = async (req,res) => {
  const teacher=await requireTeacher(req);
  const schedule=await ExamSchedule.findOne(req.tenantFilter({_id:req.params.scheduleId})).lean();
  if(!schedule)return res.status(404).json({error:'Exam paper not found'});
  if(!(await teacherOwnsExamSchedule(req,teacher,schedule)))return res.status(403).json({error:'You are not assigned to this course/section'});
  if(schedule.marksVerifiedAt)return res.status(409).json({error:'Marks are verified and locked'});

  const exam=await Exam.findOne(req.tenantFilter({_id:schedule.examId}));
  if(!exam)return res.status(404).json({error:'Exam not found'});
  if(['compiled','published','closed'].includes(String(exam.status||'')))return res.status(409).json({error:'Marks are locked after result compilation/publication'});
  if(!Array.isArray(req.body.marks))return res.status(400).json({error:'Marks array is required'});

  const students=await Student.find(req.tenantFilter({
    sectionId:schedule.sectionId,
    academicSessionId:schedule.academicSessionId,
    programId:schedule.programId,
    status:'active'
  })).select('_id').lean();
  const validSet=new Set(students.map(s=>String(s._id)));
  const scheme=await teacherGradeScheme(req,exam);
  const ops=[];

  for(const item of req.body.marks){
    if(!validSet.has(String(item.studentId)))return res.status(400).json({error:'A submitted student is not active in this section'});
    const absent=item.absent===true, withheld=item.withheld===true;
    let marks=null,status='pending',percentage=0,grade={grade:'',gradePoint:0,remarks:''};

    if(absent) status='absent';
    else if(withheld) status='withheld';
    else {
      if(item.marksObtained===''||item.marksObtained===null||item.marksObtained===undefined) continue;
      marks=Number(item.marksObtained);
      if(!Number.isFinite(marks)||marks<0||marks>Number(schedule.totalMarks)){
        return res.status(400).json({error:`Marks must be between 0 and ${schedule.totalMarks}`});
      }
      percentage=Number(((marks/Number(schedule.totalMarks))*100).toFixed(2));
      grade=teacherApplyGrade(scheme,percentage);
      status=marks>=Number(schedule.passingMarks)?'pass':'fail';
    }

    ops.push({updateOne:{
      filter:{collegeId:req.collegeId||req.user.collegeId,scheduleId:schedule._id,studentId:item.studentId},
      update:{$set:{
        examId:exam._id,
        sectionId:schedule.sectionId,
        courseId:schedule.courseId,
        totalMarks:schedule.totalMarks,
        marksObtained:marks,
        percentage,
        grade:grade.grade,
        gradePoint:grade.gradePoint,
        resultStatus:status,
        remarks:teacherClean(item.remarks)||grade.remarks,
        enteredBy:req.user._id,
        enteredAt:new Date(),
        verifiedBy:null,
        verifiedAt:null,
        publishedAt:null
      }},
      upsert:true
    }});
  }

  if(ops.length)await ExamResult.bulkWrite(ops);
  if(['draft','scheduled'].includes(exam.status)){exam.status='marks_entry';await exam.save();}
  res.json({message:'Marks saved',count:ops.length});
};

exports.registerPushToken=async(req,res)=>{
  const token=String(req.body.token||'').trim();
  const platform=String(req.body.platform||'android').toLowerCase();
  if(!/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/.test(token))return res.status(400).json({error:'Invalid Expo push token'});
  const User=require('../../models/User');
  await User.updateOne({_id:req.user._id},{
    $pull:{pushTokens:{token}},
  });
  await User.updateOne({_id:req.user._id},{
    $push:{pushTokens:{token,platform:platform==='ios'?'ios':'android',deviceName:String(req.body.deviceName||'').trim(),enabled:true,lastSeenAt:new Date()}}
  });
  res.json({message:'Push notification device registered'});
};
exports.unregisterPushToken=async(req,res)=>{
  const token=String(req.body.token||'').trim();
  const User=require('../../models/User');
  if(token)await User.updateOne({_id:req.user._id},{$pull:{pushTokens:{token}}});
  res.json({message:'Push notification device removed'});
};
