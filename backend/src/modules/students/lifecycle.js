const Student=require('../../models/Student');const {syncStudentAccess,ensureStudentUser}=require('../../services/accountProvisioningService');const StudentEnrollment=require('../../models/StudentEnrollment');const StudentLifecycleEvent=require('../../models/StudentLifecycleEvent');const Section=require('../../models/Section');const AcademicSession=require('../../models/AcademicSession');const Program=require('../../models/Program');const {audit}=require('../../services/auditService');const {toId}=require('../../utils/normalize');
const cid=req=>req.collegeId||req.user.collegeId;
async function student(req){const s=await Student.findOne(req.tenantFilter({_id:req.params.id}));if(!s)throw Object.assign(new Error('Student not found'),{status:404});return s;}
async function activeEnrollment(collegeId,studentId){return StudentEnrollment.findOne({collegeId,studentId,status:'active'}).sort({createdAt:-1});}
exports.enrollments=async(req,res)=>{const s=await student(req);const rows=await StudentEnrollment.find({collegeId:cid(req),studentId:s._id}).populate('academicSessionId programId sectionId').sort({startedAt:-1});res.json(rows);};
exports.history=async(req,res)=>{const s=await student(req);const rows=await StudentLifecycleEvent.find({collegeId:cid(req),studentId:s._id}).populate('fromAcademicSessionId toAcademicSessionId fromSectionId toSectionId performedBy').sort({effectiveDate:-1});res.json(rows);};
exports.promote=async(req,res)=>{const collegeId=cid(req),s=await student(req);if(s.status!=='active')return res.status(409).json({error:'Only active students can be promoted'});const target=await Section.findOne({_id:req.body.sectionId,collegeId,isActive:true});if(!target)return res.status(400).json({error:'Invalid target section'});const session=await AcademicSession.findOne({_id:req.body.academicSessionId||target.academicSessionId,collegeId});if(!session)return res.status(400).json({error:'Invalid target academic session'});if(toId(target.programId)!==toId(s.programId))return res.status(400).json({error:'Promotion must remain in the same program'});if(Number(target.semester)<=Number(s.currentSemester||0)&&!req.body.allowRepeat)return res.status(400).json({error:'Target semester must be greater than current semester unless allowRepeat is true'});const occupied=await Student.countDocuments({collegeId,sectionId:target._id,status:'active'});if(target.capacity&&occupied>=target.capacity)return res.status(409).json({error:'Target section capacity reached'});const current=await activeEnrollment(collegeId,s._id);if(current){current.status=Number(target.semester)>Number(s.currentSemester||0)?'promoted':'completed';current.endedAt=new Date();current.reason=req.body.reason||'';await current.save();}const from={session:s.academicSessionId,section:s.sectionId,semester:s.currentSemester};s.academicSessionId=session._id;s.sectionId=target._id;s.currentSemester=target.semester;if(req.body.rollNo!==undefined)s.rollNo=req.body.rollNo;await s.save();if(s.rollNo)await ensureStudentUser(s);await StudentEnrollment.create({collegeId,studentId:s._id,academicSessionId:session._id,programId:s.programId,sectionId:target._id,semester:target.semester,rollNo:s.rollNo||'',status:'active',createdBy:req.user._id});await StudentLifecycleEvent.create({collegeId,studentId:s._id,type:'promoted',fromAcademicSessionId:from.session,toAcademicSessionId:session._id,fromSectionId:from.section,toSectionId:target._id,fromSemester:from.semester,toSemester:target.semester,reason:req.body.reason||'',performedBy:req.user._id});await audit(req,'PROMOTE','Student',s._id,{toSemester:target.semester,toSectionId:target._id});res.json(s);};

exports.assignSection=async(req,res)=>{
  const collegeId=cid(req),s=await student(req);
  if(s.status!=='active')return res.status(409).json({error:'Only active students can be assigned to a section'});
  if(s.sectionId)return res.status(409).json({error:'Student already has a section. Use Change Class / Section for an existing allocation.'});

  const target=await Section.findOne({_id:req.body.sectionId,collegeId,isActive:true});
  if(!target)return res.status(400).json({error:'Invalid target section'});
  if(toId(target.programId)!==toId(s.programId)||toId(target.academicSessionId)!==toId(s.academicSessionId)||Number(target.periodNumber||target.semester||1)!==Number(s.currentPeriod||s.currentSemester||1)){
    return res.status(400).json({error:'Section must match the student program, session and academic period'});
  }

  const gender=String(s.gender||'').trim().toLowerCase();
  if(target.genderType==='boys'&&!['male','boy','boys','m'].includes(gender))return res.status(409).json({error:'Only male students can be assigned to a Boys section'});
  if(target.genderType==='girls'&&!['female','girl','girls','f'].includes(gender))return res.status(409).json({error:'Only female students can be assigned to a Girls section'});

  const occupied=await Student.countDocuments({collegeId,sectionId:target._id,status:'active'});
  if(target.capacity&&occupied>=target.capacity)return res.status(409).json({error:'Target section capacity reached'});

  const current=await activeEnrollment(collegeId,s._id);
  if(current&&current.sectionId)return res.status(409).json({error:'Student already has an active section enrollment'});

  s.sectionId=target._id;
  await s.save();

  if(current){
    current.sectionId=target._id;
    current.programId=s.programId;
    current.academicSessionId=s.academicSessionId;
    current.semester=Number(s.currentPeriod||s.currentSemester||target.periodNumber||1);
    current.rollNo=s.rollNo||current.rollNo||'';
    await current.save();
  }else{
    await StudentEnrollment.create({
      collegeId,studentId:s._id,academicSessionId:s.academicSessionId,programId:s.programId,
      sectionId:target._id,semester:Number(s.currentPeriod||s.currentSemester||target.periodNumber||1),
      rollNo:s.rollNo||'',status:'active',createdBy:req.user._id
    });
  }

  await StudentLifecycleEvent.create({
    collegeId,studentId:s._id,type:'section_transferred',toAcademicSessionId:s.academicSessionId,
    toSectionId:target._id,toSemester:Number(s.currentPeriod||s.currentSemester||target.periodNumber||1),
    reason:req.body.reason||'Initial section allocation',performedBy:req.user._id,
    metadata:{initialAssignment:true}
  });
  await audit(req,'ASSIGN_SECTION','Student',s._id,{toSectionId:target._id,initialAssignment:true});
  res.json(await Student.findById(s._id).populate('programId sectionId academicSessionId'));
};

exports.transferSection=async(req,res)=>{const collegeId=cid(req),s=await student(req);if(s.status!=='active')return res.status(409).json({error:'Only active students can be transferred'});const target=await Section.findOne({_id:req.body.sectionId,collegeId,isActive:true});if(!target)return res.status(400).json({error:'Invalid target section'});if(toId(target.programId)!==toId(s.programId)||toId(target.academicSessionId)!==toId(s.academicSessionId)||Number(target.semester)!==Number(s.currentSemester))return res.status(400).json({error:'Section transfer must stay in current program, session and semester'});const occupied=await Student.countDocuments({collegeId,sectionId:target._id,status:'active'});if(target.capacity&&occupied>=target.capacity)return res.status(409).json({error:'Target section capacity reached'});const from=s.sectionId;s.sectionId=target._id;if(req.body.rollNo!==undefined)s.rollNo=req.body.rollNo;await s.save();if(s.rollNo)await ensureStudentUser(s);const current=await activeEnrollment(collegeId,s._id);if(current){current.sectionId=target._id;current.rollNo=s.rollNo||current.rollNo;await current.save();}await StudentLifecycleEvent.create({collegeId,studentId:s._id,type:'section_transferred',fromSectionId:from,toSectionId:target._id,fromSemester:s.currentSemester,toSemester:s.currentSemester,reason:req.body.reason||'',performedBy:req.user._id});await audit(req,'TRANSFER_SECTION','Student',s._id,{fromSectionId:from,toSectionId:target._id});res.json(s);};
exports.changeStatus=async(req,res)=>{
  const collegeId=cid(req),s=await student(req);
  const {status,reason,reactivationInstructions,suspensionUntil}=req.body;
  if(!['active','suspended','withdrawn','graduated','alumni','transferred','dropped'].includes(status))return res.status(400).json({error:'Invalid student status'});
  const old=s.status;if(old===status)return res.json(s);
  const map={suspended:'suspended',withdrawn:'withdrawn',graduated:'graduated',alumni:'alumni',active:old==='suspended'?'reactivated':'enrolled',transferred:'withdrawn',dropped:'dropped'};
  s.status=status;
  if(status==='suspended'){
    s.suspendedAt=new Date();
    s.suspensionReason=String(reason||'').trim();
    s.suspensionUntil=suspensionUntil||undefined;
    s.reactivationInstructions=String(reactivationInstructions||'Contact college administration for reactivation procedure.').trim();
  }
  if(status==='active'){
    if(old==='suspended')s.reactivatedAt=new Date();
    s.suspendedAt=undefined;s.suspensionUntil=undefined;s.suspensionReason='';s.reactivationInstructions='';
  }
  if(status==='graduated')s.graduationDate=new Date();
  if(status==='withdrawn'||status==='transferred'||status==='dropped')s.withdrawalDate=new Date();
  await s.save();
  const current=await activeEnrollment(collegeId,s._id);
  if(current&&status!=='active'){
    current.status=status==='alumni'?'graduated':status==='dropped'?'withdrawn':status;
    current.endedAt=new Date();current.reason=reason||'';await current.save();
  }
  if(s.rollNo)await ensureStudentUser(s);
  await syncStudentAccess(s);
  await StudentLifecycleEvent.create({collegeId,studentId:s._id,type:map[status],fromAcademicSessionId:s.academicSessionId,fromSectionId:s.sectionId,fromSemester:s.currentSemester,reason:reason||'',performedBy:req.user._id,metadata:{previousStatus:old,newStatus:status,reactivationInstructions:s.reactivationInstructions||'',suspensionUntil:s.suspensionUntil||null}});
  await audit(req,'CHANGE_STATUS','Student',s._id,{from:old,to:status,reason});res.json(s);
};

// Bulk academic promotion / rollover.
// School/Cambridge: move to another class/program in a different session.
// College: Part 1 -> Part 2 inside the same program and same session.
// University: Semester N -> N+1 inside the same program and same session.
// Final College/University period can be completed in bulk with completeProgram=true.
exports.bulkPromote=async(req,res)=>{
  const collegeId=cid(req);
  const {studentIds,targetSectionId,targetAcademicSessionId,reason,completeProgram=false}=req.body||{};
  if(!Array.isArray(studentIds)||!studentIds.length)return res.status(400).json({error:'Select at least one student'});
  if(studentIds.length>500)return res.status(400).json({error:'A maximum of 500 students can be processed at one time'});

  const uniqueIds=[...new Set(studentIds.map(String))];
  const students=await Student.find({collegeId,_id:{$in:uniqueIds}});
  if(students.length!==uniqueIds.length)return res.status(400).json({error:'One or more selected students are invalid'});
  const inactive=students.filter(s=>s.status!=='active');
  if(inactive.length)return res.status(409).json({error:`${inactive.length} selected student(s) are not active`});

  const sourceProgramIds=[...new Set(students.map(s=>String(toId(s.programId))))];
  const sourceSessionIds=[...new Set(students.map(s=>String(toId(s.academicSessionId))))];
  const sourcePeriods=[...new Set(students.map(s=>Number(s.currentPeriod||s.currentSemester||1)))];
  if(sourceProgramIds.length!==1||sourceSessionIds.length!==1||sourcePeriods.length!==1){
    return res.status(400).json({error:'Bulk promotion must contain students from the same program, session and academic period'});
  }

  const sourceProgram=await Program.findOne({_id:sourceProgramIds[0],collegeId});
  if(!sourceProgram)return res.status(400).json({error:'Source program not found'});
  const sourceSessionId=sourceSessionIds[0];
  const sourcePeriod=sourcePeriods[0];
  const maxPeriod=Number(sourceProgram.durationUnits||sourceProgram.durationSemesters||1);
  const withinProgram=['college','university'].includes(sourceProgram.academicType);

  if(completeProgram){
    if(!withinProgram)return res.status(400).json({error:'Program completion is available here only for College and University programs'});
    if(sourcePeriod<maxPeriod)return res.status(409).json({error:`Students are currently in period ${sourcePeriod} of ${maxPeriod}. Promote them to the next period before completing the program.`});

    const now=new Date();
    for(const s of students){
      const current=await activeEnrollment(collegeId,s._id);
      if(current){current.status='graduated';current.endedAt=now;current.reason=reason||'Program completed';await current.save();}
      s.status='graduated';s.graduationDate=now;await s.save();await syncStudentAccess(s);
      await StudentLifecycleEvent.create({
        collegeId,studentId:s._id,type:'graduated',fromAcademicSessionId:s.academicSessionId,
        fromSectionId:s.sectionId,fromSemester:sourcePeriod,reason:reason||'Program completed',
        performedBy:req.user._id,metadata:{programId:s.programId,academicType:sourceProgram.academicType,bulk:true,programCompleted:true}
      });
    }
    await audit(req,'BULK_COMPLETE_PROGRAM','Student',null,{count:students.length,programId:sourceProgram._id,sessionId:sourceSessionId,period:sourcePeriod});
    return res.json({message:`${students.length} student(s) completed the program successfully`,count:students.length,completed:true});
  }

  if(!targetSectionId)return res.status(400).json({error:'Target section is required'});
  const target=await Section.findOne({_id:targetSectionId,collegeId,isActive:true}).populate('programId academicSessionId');
  if(!target)return res.status(400).json({error:'Invalid target section'});
  const session=await AcademicSession.findOne({_id:targetAcademicSessionId||target.academicSessionId?._id||target.academicSessionId,collegeId});
  if(!session)return res.status(400).json({error:'Invalid target academic session'});
  if(toId(target.academicSessionId)!==toId(session._id))return res.status(400).json({error:'Target section does not belong to the selected target session'});

  const targetPeriod=Number(target.periodNumber||target.semester||1);
  const targetProgramId=String(toId(target.programId));

  if(withinProgram){
    if(sourcePeriod>=maxPeriod)return res.status(409).json({error:'This is the final academic period. Complete/graduate the program instead of promoting to another period.'});
    if(targetProgramId!==String(sourceProgram._id))return res.status(400).json({error:'College/University period promotion must remain in the same program'});
    if(String(toId(session._id))!==String(sourceSessionId))return res.status(400).json({error:'College Part and University Semester promotions must remain in the same academic session'});
    if(targetPeriod!==sourcePeriod+1){
      const label=sourceProgram.academicType==='college'?'Part':'Semester';
      return res.status(400).json({error:`Target must be ${label} ${sourcePeriod+1}`});
    }
  }else{
    if(String(toId(session._id))===String(sourceSessionId))return res.status(400).json({error:'School/Class promotion must use a different academic session'});
  }

  const alreadyTarget=students.filter(s=>toId(s.academicSessionId)===toId(session._id)&&toId(s.sectionId)===toId(target._id));
  if(alreadyTarget.length)return res.status(409).json({error:`${alreadyTarget.length} selected student(s) are already in the target section`});

  const existingTargetEnrollments=await StudentEnrollment.find({collegeId,studentId:{$in:uniqueIds},academicSessionId:session._id,semester:targetPeriod}).select('studentId');
  if(existingTargetEnrollments.length)return res.status(409).json({error:`${existingTargetEnrollments.length} selected student(s) already have an enrollment for the target session/period`});

  const occupied=await Student.countDocuments({collegeId,sectionId:target._id,status:'active'});
  if(target.capacity&&occupied+students.length>target.capacity)return res.status(409).json({error:`Target section capacity is ${target.capacity}. ${occupied} place(s) are already occupied and ${students.length} students were selected.`});

  const now=new Date();
  for(const s of students){
    const from={session:s.academicSessionId,section:s.sectionId,program:s.programId,period:Number(s.currentPeriod||s.currentSemester||1)};
    const current=await activeEnrollment(collegeId,s._id);
    if(current){current.status='promoted';current.endedAt=now;current.reason=reason||'Academic promotion';await current.save();}

    s.academicSessionId=session._id;
    s.programId=target.programId?._id||target.programId;
    s.sectionId=target._id;
    s.currentPeriod=targetPeriod;
    s.currentSemester=targetPeriod;
    await s.save();

    await StudentEnrollment.create({collegeId,studentId:s._id,academicSessionId:session._id,programId:s.programId,sectionId:target._id,semester:targetPeriod,rollNo:s.rollNo||'',status:'active',createdBy:req.user._id});
    await StudentLifecycleEvent.create({collegeId,studentId:s._id,type:'promoted',fromAcademicSessionId:from.session,toAcademicSessionId:session._id,fromSectionId:from.section,toSectionId:target._id,fromSemester:from.period,toSemester:targetPeriod,reason:reason||'Academic promotion',performedBy:req.user._id,metadata:{fromProgramId:from.program,toProgramId:s.programId,academicType:sourceProgram.academicType,bulk:true}});
  }

  await audit(req,'BULK_PROMOTE','Student',null,{count:students.length,sourceProgramId:sourceProgram._id,targetSessionId:session._id,targetProgramId:target.programId?._id||target.programId,targetSectionId:target._id,targetPeriod});
  res.json({message:`${students.length} student(s) promoted successfully`,count:students.length});
};

// Administrative class/program or section change. Promotion remains a separate academic workflow.
exports.changeClass=async(req,res)=>{
  const collegeId=cid(req),s=await student(req);
  if(s.status!=='active')return res.status(409).json({error:'Only active students can change class/section'});
  const target=await Section.findOne({_id:req.body.sectionId,collegeId,isActive:true}).populate('programId academicSessionId');
  if(!target)return res.status(400).json({error:'Invalid target section'});
  if(toId(target.academicSessionId)!==toId(s.academicSessionId))return res.status(400).json({error:'Change Class must remain in the current academic session. Use Promote Class for academic progression.'});
  const targetPeriod=Number(target.periodNumber||target.semester||1);
  const currentPeriod=Number(s.currentPeriod||s.currentSemester||1);
  if(targetPeriod!==currentPeriod)return res.status(400).json({error:'Target section must belong to the student current academic period. Use Promote Class to move to the next Part/Semester/Class.'});
  const occupied=await Student.countDocuments({collegeId,sectionId:target._id,status:'active',_id:{$ne:s._id}});
  if(target.capacity&&occupied>=target.capacity)return res.status(409).json({error:'Target section capacity reached'});
  const from={program:s.programId,section:s.sectionId,session:s.academicSessionId,period:currentPeriod};
  const targetProgramId=target.programId?._id||target.programId;
  if(toId(from.program)===toId(targetProgramId)&&toId(from.section)===toId(target._id))return res.status(409).json({error:'Student is already in the selected class/program and section'});
  s.programId=targetProgramId;s.sectionId=target._id;if(req.body.rollNo!==undefined&&String(req.body.rollNo).trim())s.rollNo=String(req.body.rollNo).trim();await s.save();if(s.rollNo)await ensureStudentUser(s);
  const current=await activeEnrollment(collegeId,s._id);if(current){current.programId=targetProgramId;current.sectionId=target._id;current.rollNo=s.rollNo||current.rollNo;await current.save();}
  await StudentLifecycleEvent.create({collegeId,studentId:s._id,type:'class_transferred',fromAcademicSessionId:from.session,toAcademicSessionId:from.session,fromSectionId:from.section,toSectionId:target._id,fromSemester:from.period,toSemester:targetPeriod,reason:req.body.reason||'',performedBy:req.user._id,metadata:{fromProgramId:from.program,toProgramId:targetProgramId}});
  await audit(req,'CHANGE_CLASS','Student',s._id,{fromProgramId:from.program,toProgramId:targetProgramId,fromSectionId:from.section,toSectionId:target._id,reason:req.body.reason||''});
  res.json(s);
};
