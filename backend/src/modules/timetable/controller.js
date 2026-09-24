const mongoose=require('mongoose');
const College=require('../../models/College');
const AcademicSession=require('../../models/AcademicSession');
const Program=require('../../models/Program');
const Section=require('../../models/Section');
const Course=require('../../models/Course');
const Employee=require('../../models/Employee');
const TeacherAssignment=require('../../models/TeacherAssignment');
const Timetable=require('../../models/Timetable');
const Room=require('../../models/TimetableRoom');
const Branch=require('../../models/Branch');
const Wing=require('../../models/Wing');
const ScheduleProfile=require('../../models/TimetableScheduleProfile');
const TimetableConstraint=require('../../models/TimetableConstraint');
const ClassTimetableConstraint=require('../../models/ClassTimetableConstraint');
const TimetableDivision=require('../../models/TimetableDivision');
const cid=req=>req.collegeId||req.user?.collegeId;
const id=v=>String(v?._id||v||'');
function minutes(v){const [h,m]=String(v||'00:00').split(':').map(Number);return h*60+m;}
function validId(v){return mongoose.isValidObjectId(v);}
function cleanText(v){return String(v||'').trim();}

const validDays=new Set(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']);

function normalizeSchedule(input={}){
 const workingDays=Array.isArray(input.workingDays)?input.workingDays.filter(d=>validDays.has(d)):[];
 if(!workingDays.length)throw Object.assign(new Error('Select at least one working day'),{status:400});
 const rawSlots=Array.isArray(input.scheduleSlots)?input.scheduleSlots:[];
 let teachingNo=0;
 const scheduleSlots=rawSlots.map(slot=>{
   const isBreak=Boolean(slot.isBreak)||cleanText(slot.label).toLowerCase().includes('break');
   if(!isBreak)teachingNo+=1;
   return{
     isBreak,
     label:cleanText(slot.label)||(isBreak?'Break':`Period ${teachingNo}`),
     periodNo:isBreak?undefined:teachingNo,
     startTime:cleanText(slot.startTime),
     endTime:cleanText(slot.endTime)
   };
 });
 if(!scheduleSlots.length)throw Object.assign(new Error('Add at least one period definition'),{status:400});
 for(const slot of scheduleSlots){
   if(!slot.startTime||!slot.endTime||slot.endTime<=slot.startTime){
     throw Object.assign(new Error(`Check start/end time for ${slot.label}`),{status:400});
   }
 }
 for(let i=1;i<scheduleSlots.length;i++){
   if(scheduleSlots[i].startTime<scheduleSlots[i-1].endTime){
     throw Object.assign(new Error(`${scheduleSlots[i].label} overlaps ${scheduleSlots[i-1].label}`),{status:400});
   }
 }
 return{
   workingDays,
   scheduleSlots,
   periodsPerDay:teachingNo,
   dayStartTime:scheduleSlots[0]?.startTime||'08:00',
   dayEndTime:scheduleSlots[scheduleSlots.length-1]?.endTime||'14:00'
 };
}

async function resolveScheduleProfile(collegeId,sectionId){
 const section=await Section.findOne({_id:sectionId,collegeId,isActive:true}).lean();
 if(!section)return{section:null,program:null,profile:null,settings:null,source:'none'};
 const program=await Program.findOne({_id:section.programId,collegeId,isActive:true}).lean();
 if(!program)return{section,program:null,profile:null,settings:null,source:'none'};
 const profiles=await ScheduleProfile.find({collegeId,isActive:true,$or:[
   {scopeType:'college'},
   {scopeType:'branch',scopeId:program.branchId},
   {scopeType:'wing',scopeId:program.wingId},
   {scopeType:'program',scopeId:program._id},
   {scopeType:'section',scopeId:section._id}
 ]}).lean();
 const priority=['section','program','wing','branch','college'];
 const profile=priority.map(type=>profiles.find(p=>p.scopeType===type)).find(Boolean)||null;
 if(profile)return{section,program,profile,settings:profile,source:profile.scopeType};
 const college=await College.findById(collegeId).select('timetableSettings').lean();
 const legacy=college?.timetableSettings||null;
 return{section,program,profile:null,settings:legacy,source:legacy?.scheduleSlots?.length?'legacy_college':'none'};
}



const DAY_NAMES=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const overlap=(aStart,aEnd,bStart,bEnd)=>aStart<bEnd&&bStart<aEnd;

function scopeMatchProgram(program,scopeType,scopeId){
 if(scopeType==='college')return true;
 if(scopeType==='branch')return id(program.branchId)===id(scopeId);
 if(scopeType==='wing')return id(program.wingId)===id(scopeId);
 if(scopeType==='program')return id(program._id)===id(scopeId);
 return true;
}

async function generationSections(collegeId,academicSessionId,scopeType,scopeId){
 const sections=await Section.find({
   collegeId,isActive:true,
   ...(academicSessionId?{academicSessionId}:{})
 }).populate('programId','name code branchId wingId academicType').populate('academicSessionId','name').lean();
 if(scopeType==='section')return sections.filter(s=>id(s._id)===id(scopeId));
 return sections.filter(s=>s.programId&&scopeMatchProgram(s.programId,scopeType,scopeId));
}

async function teacherConstraintMap(collegeId){
 const rows=await TimetableConstraint.find({collegeId,isActive:true}).lean();
 const map=new Map();
 for(const row of rows){
   const key=id(row.teacherId);
   if(!map.has(key))map.set(key,[]);
   map.get(key).push(row);
 }
 return map;
}
async function classConstraintMap(collegeId){
 const rows=await ClassTimetableConstraint.find({collegeId,isActive:true}).lean();
 const map=new Map();
 for(const row of rows){const key=id(row.sectionId);if(!map.has(key))map.set(key,[]);map.get(key).push(row);}
 return map;
}
function relativeClassBlocked(constraints,candidate){
 const slots=(candidate?.profile?.scheduleSlots||[]).filter(s=>!s.isBreak);
 if(!slots.length)return false;
 const index=slots.findIndex(s=>minutes(s.startTime)===Number(candidate.start)&&minutes(s.endTime)===Number(candidate.end));
 if(index<0)return false;
 return (constraints||[]).some(rule=>{
   if(rule.type!=='relative_unavailable')return false;
   if(rule.dayOfWeek!==null&&rule.dayOfWeek!==undefined&&Number(rule.dayOfWeek)!==Number(candidate.day))return false;
   const count=Math.max(1,Number(rule.relativeCount||1));
   return rule.relativePosition==='first'?index<count:index>=Math.max(0,slots.length-count);
 });
}

function intervalConstraintBlocked(constraints,day,start,end){
 return (constraints||[]).some(c=>{
   if(c.type!=='unavailable')return false;
   if(c.dayOfWeek!==null&&c.dayOfWeek!==undefined&&Number(c.dayOfWeek)!==Number(day))return false;
   if(c.startMinutes===null||c.startMinutes===undefined||c.endMinutes===null||c.endMinutes===undefined)return false;
   return overlap(start,end,Number(c.startMinutes),Number(c.endMinutes));
 });
}

function teacherMaxDaily(constraints,defaultValue=6){
 const row=(constraints||[]).find(c=>c.type==='max_daily'&&Number(c.maxPeriodsPerDay)>0);
 return row?Number(row.maxPeriodsPerDay):defaultValue;
}
function teacherMaxConsecutive(constraints,defaultValue=4){
 const row=(constraints||[]).find(c=>c.type==='max_consecutive'&&Number(c.maxConsecutivePeriods)>0);
 return row?Number(row.maxConsecutivePeriods):defaultValue;
}
function wouldExceedConsecutive(rows,teacherId,day,start,end,maxConsecutive){
 const list=rows.filter(r=>id(r.teacherId)===id(teacherId)&&Number(r.dayOfWeek)===Number(day))
   .map(r=>({start:Number(r.startMinutes),end:Number(r.endMinutes)}));
 list.push({start:Number(start),end:Number(end)});
 list.sort((a,b)=>a.start-b.start);
 let chain=1,best=1;
 for(let i=1;i<list.length;i++){
   const gap=list[i].start-list[i-1].end;
   if(gap>=0&&gap<=5)chain++;else chain=1;
   best=Math.max(best,chain);
 }
 return best>maxConsecutive;
}

function preferredScore(constraints,day,start,end){
 return (constraints||[]).some(c=>c.type==='preferred'&&
   (c.dayOfWeek===null||c.dayOfWeek===undefined||Number(c.dayOfWeek)===Number(day))&&
   c.startMinutes!==null&&c.endMinutes!==null&&overlap(start,end,Number(c.startMinutes),Number(c.endMinutes))
 )?8:0;
}

function countTeacherDay(rows,teacherId,day){
 return rows.filter(r=>id(r.teacherId)===id(teacherId)&&Number(r.dayOfWeek)===Number(day)).length;
}
function countSubjectDay(rows,sectionId,courseId,day){
 return rows.filter(r=>id(r.sectionId)===id(sectionId)&&id(r.courseId)===id(courseId)&&Number(r.dayOfWeek)===Number(day)).length;
}
function hasConflict(rows,{teacherId,sectionId,divisionId,room,day,start,end}){
 return rows.some(r=>{
   if(Number(r.dayOfWeek)!==Number(day)||!overlap(start,end,Number(r.startMinutes),Number(r.endMinutes)))return false;
   if(id(r.teacherId)===id(teacherId))return true; // college-wide teacher conflict, including other wings
   if(id(r.sectionId)===id(sectionId)){
     const existingDivision=id(r.divisionId),incomingDivision=id(divisionId);
     if(!existingDivision||!incomingDivision||existingDivision===incomingDivision)return true;
   }
   if(room&&r.room&&String(r.room).toLowerCase()===String(room).toLowerCase())return true;
   return false;
 });
}

async function candidateSlotsForSection(collegeId,sectionId,lessonSpan=1){
 const resolved=await resolveScheduleProfile(collegeId,sectionId);
 const settings=resolved.settings||{};
 const teaching=(settings.scheduleSlots||[]).filter(s=>!s.isBreak);
 const working=settings.workingDays||[];
 const candidates=[];
 for(const dayName of working){
   const day=DAY_NAMES.indexOf(String(dayName).toLowerCase());
   if(day<0)continue;
   for(let i=0;i<teaching.length;i++){
     const block=teaching.slice(i,i+lessonSpan);
     if(block.length!==lessonSpan)continue;
     let contiguous=true;
     for(let j=1;j<block.length;j++){
       if(block[j-1].endTime!==block[j].startTime){contiguous=false;break;}
     }
     if(!contiguous)continue;
     candidates.push({
       day,
       periodNo:Number(block[0].periodNo),
       start:minutes(block[0].startTime),
       end:minutes(block[block.length-1].endTime),
       profile:resolved.profile,
       profileSource:resolved.source
     });
   }
 }
 return candidates;
}

exports.options=async(req,res)=>{
 const collegeId=cid(req);
 const [college,sessions,programs,sections,courses,teachers,rooms,branches,wings,profiles,divisions]=await Promise.all([
  College.findById(collegeId).lean(),
  AcademicSession.find({collegeId}).sort({startDate:-1}).lean(),
  Program.find({collegeId,isActive:true}).populate('branchId','name code').populate('wingId','name code academicType').sort({name:1}).lean(),
  Section.find({collegeId,isActive:true}).populate('programId','name code academicType branchId wingId').populate('academicSessionId','name').sort({name:1}).lean(),
  Course.find({collegeId,isActive:true}).sort({name:1}).lean(),
  Employee.find({collegeId,category:'academic_staff',isActive:true}).select('name employeeNo branchId').sort({name:1}).lean(),
  Room.find({collegeId,isActive:true}).sort({name:1}).lean(),
  Branch.find({collegeId,isActive:true}).sort({name:1}).lean(),
  Wing.find({collegeId,isActive:true}).sort({name:1}).lean(),
  ScheduleProfile.find({collegeId,isActive:true}).sort({scopeType:1,name:1}).lean(),
  TimetableDivision.find({collegeId,isActive:true}).populate('sectionId','name programId academicSessionId').sort({name:1}).lean()
 ]);
 res.json({college:college?{_id:college._id,name:college.name}:null,settings:college?.timetableSettings||{},sessions,programs,sections,courses,teachers,rooms,branches,wings,profiles,divisions});
};


exports.saveSettings=async(req,res)=>{
 const collegeId=cid(req);
 const college=await College.findById(collegeId);
 if(!college)return res.status(404).json({error:'College not found'});
 const normalized=normalizeSchedule(req.body||{});
 college.timetableSettings=normalized;
 await college.save();
 const profile=await ScheduleProfile.findOneAndUpdate(
  {collegeId,scopeType:'college',scopeId:null,isActive:true},
  {$set:{name:'College Default',...normalized,updatedBy:req.user._id},$setOnInsert:{collegeId,scopeType:'college',scopeId:null,createdBy:req.user._id,isActive:true}},
  {new:true,upsert:true,setDefaultsOnInsert:true}
 );
 res.json(profile);
};

exports.scheduleProfiles=async(req,res)=>{
 res.json(await ScheduleProfile.find({collegeId:cid(req),isActive:true}).sort({scopeType:1,name:1}).lean());
};

exports.saveScheduleProfile=async(req,res)=>{
 const collegeId=cid(req),b=req.body||{};
 const scopeType=String(b.scopeType||'college');
 if(!['college','branch','wing','program','section'].includes(scopeType))return res.status(400).json({error:'Invalid schedule scope'});
 const scopeId=scopeType==='college'?null:b.scopeId;
 if(scopeType!=='college'&&!validId(scopeId))return res.status(400).json({error:'Select a valid schedule scope item'});

 if(scopeType==='branch'&&!await Branch.exists({_id:scopeId,collegeId,isActive:true}))return res.status(400).json({error:'Invalid Branch'});
 if(scopeType==='wing'&&!await Wing.exists({_id:scopeId,collegeId,isActive:true}))return res.status(400).json({error:'Invalid Wing'});
 if(scopeType==='program'&&!await Program.exists({_id:scopeId,collegeId,isActive:true}))return res.status(400).json({error:'Invalid Class / Program'});
 if(scopeType==='section'&&!await Section.exists({_id:scopeId,collegeId,isActive:true}))return res.status(400).json({error:'Invalid Section'});

 const normalized=normalizeSchedule(b);
 const name=cleanText(b.name)||(
   scopeType==='college'?'College Default':
   `${scopeType.charAt(0).toUpperCase()+scopeType.slice(1)} Schedule`
 );
 const profile=await ScheduleProfile.findOneAndUpdate(
  {collegeId,scopeType,scopeId,isActive:true},
  {$set:{name,...normalized,updatedBy:req.user._id},$setOnInsert:{collegeId,scopeType,scopeId,createdBy:req.user._id,isActive:true}},
  {new:true,upsert:true,setDefaultsOnInsert:true}
 );
 if(scopeType==='college'){
   const college=await College.findById(collegeId);
   if(college){college.timetableSettings=normalized;await college.save();}
 }
 res.json(profile);
};

exports.deleteScheduleProfile=async(req,res)=>{
 const doc=await ScheduleProfile.findOne({_id:req.params.id,collegeId:cid(req),isActive:true});
 if(!doc)return res.status(404).json({error:'Schedule profile not found'});
 if(doc.scopeType==='college')return res.status(409).json({error:'College Default schedule cannot be deleted; edit it instead'});
 doc.isActive=false;doc.updatedBy=req.user._id;await doc.save();
 res.json({ok:true});
};

exports.resolveSchedule=async(req,res)=>{
 if(!validId(req.query.sectionId))return res.status(400).json({error:'Section is required'});
 const resolved=await resolveScheduleProfile(cid(req),req.query.sectionId);
 if(!resolved.section)return res.status(404).json({error:'Section not found'});
 res.json({profile:resolved.profile,settings:resolved.settings,source:resolved.source});
};

exports.assignments=async(req,res)=>{
 const q={collegeId:cid(req),isActive:true};
 if(req.query.academicSessionId)q.academicSessionId=req.query.academicSessionId;
 if(req.query.sectionId)q.sectionId=req.query.sectionId;
 res.json(await TeacherAssignment.find(q).populate('academicSessionId programId sectionId courseId teacherId').sort({createdAt:-1}));
};

exports.saveAssignment=async(req,res)=>{
 const collegeId=cid(req),b=req.body||{};
 for(const k of ['academicSessionId','sectionId','courseId','teacherId']) if(!validId(b[k])) return res.status(400).json({error:`${k} is required`});
 const section=await Section.findOne({_id:b.sectionId,collegeId});
 const course=await Course.findOne({_id:b.courseId,collegeId,isActive:true});
 if(!section||!course)return res.status(404).json({error:'Section or subject not found'});
 if(id(section.academicSessionId)!==id(b.academicSessionId))return res.status(400).json({error:'Selected section does not belong to the selected session'});
 if(id(course.programId)!==id(section.programId)||Number(course.periodNumber)!==Number(section.periodNumber))return res.status(400).json({error:'Selected subject does not belong to this class/section'});
 const teacher=await Employee.findOne({_id:b.teacherId,collegeId,category:'academic_staff',isActive:true}).select('_id');
 if(!teacher)return res.status(400).json({error:'Selected teacher is not an active academic employee'});
 await TeacherAssignment.updateMany({collegeId,academicSessionId:b.academicSessionId,sectionId:b.sectionId,courseId:b.courseId,teacherId:{$ne:b.teacherId},isActive:true},{$set:{isActive:false}});
 const doc=await TeacherAssignment.findOneAndUpdate(
  {collegeId,academicSessionId:b.academicSessionId,sectionId:b.sectionId,courseId:b.courseId,teacherId:b.teacherId},
  {$set:{programId:section.programId,periodNumber:section.periodNumber,weeklyPeriods:Number(b.weeklyPeriods||5),lessonSpan:Number(b.lessonSpan||1),preferredRoom:cleanText(b.preferredRoom),divisionId:validId(b.divisionId)?b.divisionId:null,maxLessonsPerDay:Number(b.maxLessonsPerDay||1),spreadAcrossWeek:b.spreadAcrossWeek!==false,isActive:true}},
  {new:true,upsert:true,setDefaultsOnInsert:true}
 );
 res.json(doc);
};

exports.saveAssignmentsBulk=async(req,res)=>{
 const collegeId=cid(req),b=req.body||{};
 if(!validId(b.academicSessionId)||!validId(b.sectionId))return res.status(400).json({error:'Session and Class / Section are required'});
 const section=await Section.findOne({_id:b.sectionId,collegeId,isActive:true});
 if(!section)return res.status(404).json({error:'Class / Section not found'});
 if(id(section.academicSessionId)!==id(b.academicSessionId))return res.status(400).json({error:'Selected section does not belong to the selected session'});
 const rows=Array.isArray(b.assignments)?b.assignments:[];
 if(!rows.length)return res.status(400).json({error:'Select at least one subject'});
 const seen=new Set();
 for(const row of rows){
  if(!validId(row.courseId)||!validId(row.teacherId))return res.status(400).json({error:'Every selected subject must have a teacher'});
  const key=id(row.courseId); if(seen.has(key))return res.status(400).json({error:'A subject can only be assigned once for a section'}); seen.add(key);
  const weekly=Number(row.weeklyPeriods); const span=Number(row.lessonSpan||1);
  if(!Number.isInteger(weekly)||weekly<1||weekly>30)return res.status(400).json({error:'Lessons per week must be between 1 and 30'});
  if(!Number.isInteger(span)||span<1||span>4)return res.status(400).json({error:'Consecutive periods must be between 1 and 4'});
  const maxPerDay=Number(row.maxLessonsPerDay||1);
  if(!Number.isInteger(maxPerDay)||maxPerDay<1||maxPerDay>4)return res.status(400).json({error:'Subject maximum lessons per day must be between 1 and 4'});
  if(row.preferredRoom){
    const roomExists=await Room.exists({collegeId,name:String(row.preferredRoom).trim(),isActive:true});
    if(!roomExists)return res.status(400).json({error:`Room ${row.preferredRoom} is not an active Timetable room`});
  }
 }
 const [courses,teachers]=await Promise.all([
  Course.find({_id:{$in:rows.map(x=>x.courseId)},collegeId,isActive:true}).select('_id programId periodNumber').lean(),
  Employee.find({_id:{$in:rows.map(x=>x.teacherId)},collegeId,category:'academic_staff',isActive:true}).select('_id').lean()
 ]);
 const courseMap=new Map(courses.map(x=>[id(x._id),x])); const teacherSet=new Set(teachers.map(x=>id(x._id)));
 for(const row of rows){const course=courseMap.get(id(row.courseId));if(!course)return res.status(400).json({error:'One or more selected subjects are invalid'});if(id(course.programId)!==id(section.programId)||Number(course.periodNumber)!==Number(section.periodNumber))return res.status(400).json({error:'One or more selected subjects do not belong to this class/section'});if(!teacherSet.has(id(row.teacherId)))return res.status(400).json({error:'One or more selected teachers are invalid'});}
 const selectedCourseIds=rows.map(x=>x.courseId);
 await TeacherAssignment.updateMany({collegeId,academicSessionId:b.academicSessionId,sectionId:b.sectionId,courseId:{$nin:selectedCourseIds},isActive:true},{$set:{isActive:false}});
 for(const row of rows){
  await TeacherAssignment.updateMany({collegeId,academicSessionId:b.academicSessionId,sectionId:b.sectionId,courseId:row.courseId,teacherId:{$ne:row.teacherId},isActive:true},{$set:{isActive:false}});
  await TeacherAssignment.findOneAndUpdate(
   {collegeId,academicSessionId:b.academicSessionId,sectionId:b.sectionId,courseId:row.courseId,teacherId:row.teacherId},
   {$set:{programId:section.programId,periodNumber:section.periodNumber,weeklyPeriods:Number(row.weeklyPeriods),lessonSpan:Number(row.lessonSpan||1),preferredRoom:cleanText(row.preferredRoom),divisionId:validId(row.divisionId)?row.divisionId:null,maxLessonsPerDay:Number(row.maxLessonsPerDay||1),spreadAcrossWeek:row.spreadAcrossWeek!==false,isActive:true}},
   {new:true,upsert:true,setDefaultsOnInsert:true}
  );
 }
 const saved=await TeacherAssignment.find({collegeId,academicSessionId:b.academicSessionId,sectionId:b.sectionId,isActive:true}).populate('academicSessionId programId sectionId courseId teacherId').sort({'courseId.name':1});
 res.json({message:`${saved.length} subject assignment${saved.length===1?'':'s'} saved.`,assignments:saved});
};

exports.removeAssignment=async(req,res)=>{await TeacherAssignment.updateOne({_id:req.params.id,collegeId:cid(req)},{$set:{isActive:false}});res.json({ok:true});};
exports.rooms=async(req,res)=>res.json(await Room.find({collegeId:cid(req)}).sort({name:1}));
exports.saveRoom=async(req,res)=>{const b=req.body||{};if(!String(b.name||'').trim())return res.status(400).json({error:'Room name is required'});const doc=b._id?await Room.findOneAndUpdate({_id:b._id,collegeId:cid(req)},{$set:{name:b.name,code:b.code||'',capacity:Number(b.capacity||40),isActive:b.isActive!==false}},{new:true}):await Room.create({collegeId:cid(req),name:b.name,code:b.code||'',capacity:Number(b.capacity||40)});res.json(doc);};
exports.grid=async(req,res)=>{const q={collegeId:cid(req),isActive:true};if(req.query.academicSessionId)q.academicSessionId=req.query.academicSessionId;if(req.query.sectionId)q.sectionId=req.query.sectionId;if(req.query.teacherId)q.teacherId=req.query.teacherId;res.json(await Timetable.find(q).populate('sectionId courseId teacherId teacherAssignmentId').sort({dayOfWeek:1,startMinutes:1}));};
exports.place=async(req,res)=>{
 const collegeId=cid(req),b=req.body||{}; const assignment=await TeacherAssignment.findOne({_id:b.teacherAssignmentId,collegeId,isActive:true}); if(!assignment)return res.status(404).json({error:'Teacher assignment not found'});
 const resolved=await resolveScheduleProfile(collegeId,assignment.sectionId);
 const slots=(resolved.settings?.scheduleSlots||[]).filter(s=>!s.isBreak);
 const slot=slots.find(s=>Number(s.periodNo)===Number(b.periodNo));
 if(!slot)return res.status(400).json({error:'Selected period is not defined for this Class / Section. Configure Timetable > Settings'});
 const d=Number(b.dayOfWeek),start=minutes(slot.startTime),end=minutes(slot.endTime);
 const clashes=await Timetable.find({collegeId,dayOfWeek:d,startMinutes:{$lt:end},endMinutes:{$gt:start},isActive:true,$or:[{teacherId:assignment.teacherId},{sectionId:assignment.sectionId}]}).lean();
 if(clashes.length)return res.status(409).json({error:'Conflict: teacher or section is already scheduled in this period'});
 const doc=await Timetable.create({collegeId,academicSessionId:assignment.academicSessionId,teacherAssignmentId:assignment._id,sectionId:assignment.sectionId,courseId:assignment.courseId,teacherId:assignment.teacherId,dayOfWeek:d,startMinutes:start,endMinutes:end,room:b.room||'',isActive:true});res.json(doc);
};
exports.removeSlot=async(req,res)=>{await Timetable.updateOne({_id:req.params.id,collegeId:cid(req)},{$set:{isActive:false}});res.json({ok:true});};
exports.validate=async(req,res)=>{
 const rows=await Timetable.find({collegeId:cid(req),isActive:true}).lean(),issues=[];
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=rows[i],b=rows[j];if(a.dayOfWeek!==b.dayOfWeek||a.startMinutes>=b.endMinutes||b.startMinutes>=a.endMinutes)continue;if(id(a.teacherId)===id(b.teacherId))issues.push('Teacher clash detected');if(id(a.sectionId)===id(b.sectionId))issues.push('Section clash detected');if(a.room&&b.room&&a.room===b.room)issues.push(`Room clash: ${a.room}`);}
 res.json({valid:issues.length===0,issues:[...new Set(issues)]});
};


exports.constraints=async(req,res)=>{
 const q={collegeId:cid(req),isActive:true};
 if(req.query.teacherId)q.teacherId=req.query.teacherId;
 res.json(await TimetableConstraint.find(q).populate('teacherId','name employeeNo branchId').sort({teacherId:1,dayOfWeek:1,startMinutes:1}).lean());
};

exports.saveConstraint=async(req,res)=>{
 const collegeId=cid(req),b=req.body||{};
 if(!validId(b.teacherId))return res.status(400).json({error:'Teacher is required'});
 const teacher=await Employee.findOne({_id:b.teacherId,collegeId,category:'academic_staff',isActive:true});
 if(!teacher)return res.status(400).json({error:'Select a valid active teacher'});
 const type=String(b.type||'unavailable');
 if(!['unavailable','preferred','max_daily','max_consecutive','avoid_first','avoid_last'].includes(type))return res.status(400).json({error:'Invalid constraint type'});
 const payload={collegeId,teacherId:teacher._id,type,note:cleanText(b.note),isActive:true,updatedBy:req.user._id};
 if(type==='max_daily'){
   const max=Number(b.maxPeriodsPerDay||0);
   if(!Number.isInteger(max)||max<1||max>20)return res.status(400).json({error:'Maximum periods per day must be between 1 and 20'});
   payload.maxPeriodsPerDay=max;
   payload.dayOfWeek=null;payload.startMinutes=null;payload.endMinutes=null;
 }else if(type==='max_consecutive'){
   const max=Number(b.maxConsecutivePeriods||0);
   if(!Number.isInteger(max)||max<1||max>12)return res.status(400).json({error:'Maximum consecutive periods must be between 1 and 12'});
   payload.maxConsecutivePeriods=max;
   payload.dayOfWeek=null;payload.startMinutes=null;payload.endMinutes=null;
 }else if(type==='avoid_first'||type==='avoid_last'){
   payload.dayOfWeek=null;payload.startMinutes=null;payload.endMinutes=null;
 }else{
   const day=Number(b.dayOfWeek),start=Number(b.startMinutes),end=Number(b.endMinutes);
   if(!Number.isInteger(day)||day<0||day>6)return res.status(400).json({error:'Day is required'});
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return res.status(400).json({error:'Valid start/end time is required'});
   payload.dayOfWeek=day;payload.startMinutes=start;payload.endMinutes=end;
 }
 const doc=b._id
   ?await TimetableConstraint.findOneAndUpdate({_id:b._id,collegeId},{$set:payload},{new:true,runValidators:true})
   :await TimetableConstraint.create({...payload,createdBy:req.user._id});
 if(!doc)return res.status(404).json({error:'Constraint not found'});
 res.json(doc);
};

exports.deleteConstraint=async(req,res)=>{
 const doc=await TimetableConstraint.findOne({_id:req.params.id,collegeId:cid(req),isActive:true});
 if(!doc)return res.status(404).json({error:'Constraint not found'});
 doc.isActive=false;doc.updatedBy=req.user._id;await doc.save();
 res.json({ok:true});
};

exports.generatePreview=async(req,res)=>{
 const collegeId=cid(req),b=req.body||{};
 const academicSessionId=b.academicSessionId;
 const scopeType=String(b.scopeType||'college');
 const scopeId=scopeType==='college'?null:b.scopeId;
 const mode=String(b.mode||'generate_new');
 if(!validId(academicSessionId))return res.status(400).json({error:'Academic Session is required'});
 if(!['college','wing','program','section'].includes(scopeType))return res.status(400).json({error:'Generation scope must be College, Wing, Program/Class or Section'});
 if(scopeType!=='college'&&!validId(scopeId))return res.status(400).json({error:'Select the generation scope'});
 if(!['generate_new','improve','regenerate_unlocked','missing_only'].includes(mode))return res.status(400).json({error:'Invalid generation mode'});

 const maxSameSubjectPerDay=Math.max(1,Math.min(3,Number(b.maxSameSubjectPerDay||1)));
 const defaultTeacherMaxDaily=Math.max(1,Math.min(12,Number(b.defaultTeacherMaxDaily||6)));

 const sections=await generationSections(collegeId,academicSessionId,scopeType,scopeId);
 if(!sections.length)return res.status(400).json({error:'No active sections found for this generation scope'});
 const sectionIds=sections.map(s=>s._id);
 const sectionIdSet=new Set(sectionIds.map(id));

 const assignments=await TeacherAssignment.find({collegeId,academicSessionId,sectionId:{$in:sectionIds},isActive:true})
   .populate('sectionId','name programId academicSessionId')
   .populate('programId','name wingId branchId')
   .populate('courseId','name code courseType')
   .populate('teacherId','name employeeNo branchId')
   .lean();
 if(!assignments.length)return res.status(400).json({error:'No teacher/subject assignments found for this scope'});

 const allExisting=await Timetable.find({collegeId,isActive:true}).lean();
 const targetExisting=allExisting.filter(r=>sectionIdSet.has(id(r.sectionId))&&id(r.academicSessionId)===id(academicSessionId));
 const outsideScope=allExisting.filter(r=>!sectionIdSet.has(id(r.sectionId))||id(r.academicSessionId)!==id(academicSessionId));
 const protectedInside=targetExisting.filter(r=>r.generationStatus==='published'||r.isLocked||r.source!=='generated');

 let preservedGenerated=[];
 if(mode==='missing_only'){
   preservedGenerated=targetExisting.filter(r=>r.source==='generated'&&r.generationStatus==='draft'&&!r.isLocked);
 }
 const fixed=[...outsideScope,...protectedInside,...preservedGenerated];
 const working=[...fixed];
 const constraintMap=await teacherConstraintMap(collegeId);
 const classRulesMap=await classConstraintMap(collegeId);
 const draft=[],unallocated=[];
 let preferenceHits=0,preferenceMisses=0;

 const existingByAssignment=new Map();
 const protectedByAssignment=new Map();
 for(const row of protectedInside){
   const key=id(row.teacherAssignmentId);
   protectedByAssignment.set(key,(protectedByAssignment.get(key)||0)+1);
 }
 for(const row of [...protectedInside,...preservedGenerated]){
   const key=id(row.teacherAssignmentId);
   existingByAssignment.set(key,(existingByAssignment.get(key)||0)+1);
 }
 // A section/span uses the same resolved schedule profile throughout this preview.
 // Cache candidates so multiple subject assignments in one section do not repeat
 // Section + Program + ScheduleProfile database lookups.
 const candidateCache=new Map();

 const jobs=[...assignments].sort((a,b)=>Number(b.lessonSpan||1)-Number(a.lessonSpan||1)||Number(b.weeklyPeriods||1)-Number(a.weeklyPeriods||1));
 for(const a of jobs){
   const required=Number(a.weeklyPeriods||1);
   const already=mode==='missing_only'||mode==='improve'?Number(existingByAssignment.get(id(a._id))||0):Number(protectedByAssignment.get(id(a._id))||0);
   const wanted=Math.max(0,required-already);
   if(!wanted)continue;

   const span=Number(a.lessonSpan||1);
   const teacherConstraints=constraintMap.get(id(a.teacherId))||[];
   const classConstraints=classRulesMap.get(id(a.sectionId))||[];
   const teacherDailyMax=teacherMaxDaily(teacherConstraints,defaultTeacherMaxDaily);
   const teacherConsecutiveMax=teacherMaxConsecutive(teacherConstraints,4);
   const subjectDailyMax=Math.max(1,Math.min(4,Number(a.maxLessonsPerDay||maxSameSubjectPerDay)));
   const candidateKey=`${id(a.sectionId)}:${span}`;
   let candidates=candidateCache.get(candidateKey);
   if(!candidates){
     candidates=await candidateSlotsForSection(collegeId,a.sectionId._id||a.sectionId,span);
     candidateCache.set(candidateKey,candidates);
   }
   if(!candidates.length){
     unallocated.push({assignmentId:a._id,course:a.courseId?.name,teacher:a.teacherId?.name,section:a.sectionId?.name,remaining:wanted,reason:'No compatible schedule profile / consecutive slots'});
     continue;
   }

   let placed=0;
   while(placed<wanted){
     const feasible=candidates.filter(c=>{
       if(intervalConstraintBlocked(teacherConstraints,c.day,c.start,c.end))return false;
       if(intervalConstraintBlocked(classConstraints,c.day,c.start,c.end))return false;
       if(relativeClassBlocked(classConstraints,c))return false;
       if(countTeacherDay(working,a.teacherId,c.day)>=teacherDailyMax)return false;
       const classMax=teacherMaxDaily(classConstraints,20); if(working.filter(r=>id(r.sectionId)===id(a.sectionId)&&Number(r.dayOfWeek)===c.day).length>=classMax)return false;
       if(countSubjectDay(working,a.sectionId,a.courseId,c.day)>=subjectDailyMax)return false;
       if(wouldExceedConsecutive(working,a.teacherId,c.day,c.start,c.end,teacherConsecutiveMax))return false;
       return !hasConflict(working,{teacherId:a.teacherId,sectionId:a.sectionId,divisionId:a.divisionId,room:a.preferredRoom||'',day:c.day,start:c.start,end:c.end});
     }).map(c=>{
       const teacherDay=countTeacherDay(working,a.teacherId,c.day);
       const sectionDay=working.filter(r=>id(r.sectionId)===id(a.sectionId)&&Number(r.dayOfWeek)===c.day).length;
       const sameSubjectDay=countSubjectDay(working,a.sectionId,a.courseId,c.day);
       const preferred=preferredScore(teacherConstraints,c.day,c.start,c.end);
       let score=preferred-(teacherDay*2)-(sectionDay*1.25)-(a.spreadAcrossWeek!==false?sameSubjectDay*5:sameSubjectDay);

       const sameDayTeacher=working.filter(r=>id(r.teacherId)===id(a.teacherId)&&Number(r.dayOfWeek)===c.day).sort((x,y)=>x.startMinutes-y.startMinutes);
       if(sameDayTeacher.length){
         const nearest=Math.min(...sameDayTeacher.map(r=>Math.min(Math.abs(c.start-Number(r.endMinutes)),Math.abs(Number(r.startMinutes)-c.end))));
         if(nearest===0)score+=3; // compact teacher schedule
         else if(nearest>60)score-=2;
       }

       const resolvedSlots=(c.profile?.scheduleSlots||[]);
       const teachingSlots=resolvedSlots.filter(s=>!s.isBreak);
       const firstStart=teachingSlots.length?minutes(teachingSlots[0].startTime):null;
       const lastEnd=teachingSlots.length?minutes(teachingSlots[teachingSlots.length-1].endTime):null;
       const avoidFirst=teacherConstraints.some(x=>x.type==='avoid_first');
       const avoidLast=teacherConstraints.some(x=>x.type==='avoid_last');
       if(avoidFirst&&firstStart!==null&&c.start===firstStart)score-=5;
       if(avoidLast&&lastEnd!==null&&c.end===lastEnd)score-=5;
       return{...c,score,preferred:preferred>0};
     }).sort((x,y)=>y.score-x.score||x.day-y.day||x.start-y.start);

     if(!feasible.length)break;
     const c=feasible[0];
     if(c.preferred)preferenceHits++;else if(teacherConstraints.some(x=>x.type==='preferred'))preferenceMisses++;
     const row={
       collegeId,academicSessionId,
       teacherAssignmentId:a._id,sectionId:a.sectionId._id||a.sectionId,courseId:a.courseId._id||a.courseId,teacherId:a.teacherId._id||a.teacherId,
       dayOfWeek:c.day,startMinutes:c.start,endMinutes:c.end,room:a.preferredRoom||'',divisionId:a.divisionId?._id||a.divisionId||null,
       generationStatus:'draft',isLocked:false,source:'generated'
     };
     working.push(row);
     draft.push({...row,sectionName:a.sectionId?.name||'',programName:a.programId?.name||'',courseName:a.courseId?.name||'',teacherName:a.teacherId?.name||''});
     placed++;
   }
   if(placed<wanted)unallocated.push({assignmentId:a._id,course:a.courseId?.name,teacher:a.teacherId?.name,section:a.sectionId?.name,remaining:wanted-placed,reason:'No conflict-free slot satisfies current hard constraints'});
 }

 const conflicts=[];
 // Conflict verification only compares lessons on the same day. This preserves
 // the existing overlap rules while avoiding a full cross-day O(n²) scan.
 const rowsByDay=new Map();
 for(const row of working){
   const day=Number(row.dayOfWeek);
   if(!rowsByDay.has(day))rowsByDay.set(day,[]);
   rowsByDay.get(day).push(row);
 }
 for(const dayRows of rowsByDay.values()){
   dayRows.sort((a,b)=>Number(a.startMinutes)-Number(b.startMinutes));
   for(let i=0;i<dayRows.length;i++){
     const x=dayRows[i];
     for(let j=i+1;j<dayRows.length;j++){
       const y=dayRows[j];
       if(Number(y.startMinutes)>=Number(x.endMinutes))break;
       if(!overlap(Number(x.startMinutes),Number(x.endMinutes),Number(y.startMinutes),Number(y.endMinutes)))continue;
       if(id(x.teacherId)===id(y.teacherId))conflicts.push('Teacher conflict');
       if(id(x.sectionId)===id(y.sectionId)){
         const dx=id(x.divisionId),dy=id(y.divisionId);
         if(!dx||!dy||dx===dy)conflicts.push('Section conflict');
       }
       if(x.room&&y.room&&String(x.room).toLowerCase()===String(y.room).toLowerCase())conflicts.push('Room conflict');
     }
   }
 }

 const unallocatedCount=unallocated.reduce((n,x)=>n+Number(x.remaining||0),0);
 const hardPenalty=(new Set(conflicts)).size*20+unallocatedCount*4;
 const softPenalty=preferenceMisses*1.5;
 const qualityScore=Math.max(0,Math.min(100,Math.round(100-hardPenalty-softPenalty)));
 res.json({
   scope:{academicSessionId,scopeType,scopeId},mode,
   sections:sections.length,assignments:assignments.length,
   draft,unallocated,conflicts:[...new Set(conflicts)],
   quality:{score:qualityScore,preferenceHits,preferenceMisses,hardConflicts:[...new Set(conflicts)].length},
   summary:{
     generatedLessons:draft.length,
     unallocatedLessons:unallocatedCount,
     fixedLessons:fixed.length,
     protectedLessons:protectedInside.length,
     preservedDraftLessons:preservedGenerated.length
   }
 });
};

exports.commitGeneration=async(req,res)=>{
 const collegeId=cid(req),b=req.body||{};
 const preview=Array.isArray(b.draft)?b.draft:[];
 if(!preview.length)return res.status(400).json({error:'No generated draft lessons to save'});
 const academicSessionId=b.academicSessionId;
 const mode=String(b.mode||'generate_new');
 if(!validId(academicSessionId))return res.status(400).json({error:'Academic Session is required'});
 const sectionIds=[...new Set(preview.map(x=>String(x.sectionId)).filter(Boolean))];
 const runId=`GEN-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

 if(mode==='generate_new'||mode==='regenerate_unlocked'||mode==='improve'){
   await Timetable.updateMany({
     collegeId,academicSessionId,sectionId:{$in:sectionIds},
     isActive:true,source:'generated',generationStatus:'draft',isLocked:false
   },{$set:{isActive:false}});
 }
 if(mode==='missing_only'){
   // Missing-only never removes any existing lesson.
 }

 const docs=preview.map(x=>({
   collegeId,academicSessionId,
   teacherAssignmentId:x.teacherAssignmentId,sectionId:x.sectionId,courseId:x.courseId,teacherId:x.teacherId,
   dayOfWeek:Number(x.dayOfWeek),startMinutes:Number(x.startMinutes),endMinutes:Number(x.endMinutes),room:x.room||'',divisionId:validId(x.divisionId)?x.divisionId:null,
   generationStatus:'draft',isLocked:false,source:'generated',generationRunId:runId,generatedBy:req.user._id,isActive:true
 }));
 await Timetable.insertMany(docs,{ordered:true});
 res.json({ok:true,runId,saved:docs.length,mode,message:`${docs.length} generated lesson(s) saved as Draft.`});
};

exports.publishGenerated=async(req,res)=>{
 const collegeId=cid(req),b=req.body||{};
 const academicSessionId=b.academicSessionId;
 if(!validId(academicSessionId))return res.status(400).json({error:'Academic Session is required'});
 const scopeType=String(b.scopeType||'college');
 const scopeId=scopeType==='college'?null:b.scopeId;
 const scopeSections=await generationSections(collegeId,academicSessionId,scopeType,scopeId);
 const scopeSectionIds=scopeSections.map(s=>s._id);

 const activeRows=await Timetable.find({collegeId,academicSessionId,isActive:true}).lean();
 const conflicts=[];
 for(let i=0;i<activeRows.length;i++)for(let j=i+1;j<activeRows.length;j++){
   const x=activeRows[i],y=activeRows[j];
   if(Number(x.dayOfWeek)!==Number(y.dayOfWeek)||!overlap(Number(x.startMinutes),Number(x.endMinutes),Number(y.startMinutes),Number(y.endMinutes)))continue;
   if(id(x.teacherId)===id(y.teacherId))conflicts.push('Teacher conflict');
   if(id(x.sectionId)===id(y.sectionId)){
     const dx=id(x.divisionId),dy=id(y.divisionId);
     if(!dx||!dy||dx===dy)conflicts.push('Section conflict');
   }
   if(x.room&&y.room&&String(x.room).toLowerCase()===String(y.room).toLowerCase())conflicts.push('Room conflict');
 }
 if(conflicts.length)return res.status(409).json({error:'Cannot publish while timetable conflicts exist',conflicts:[...new Set(conflicts)]});

 const targetRows=activeRows.filter(r=>scopeSectionIds.some(s=>id(s)===id(r.sectionId)));
 const assignments=await TeacherAssignment.find({collegeId,academicSessionId,sectionId:{$in:scopeSectionIds},isActive:true}).lean();
 const missing=[];
 for(const a of assignments){
   const count=targetRows.filter(r=>id(r.teacherAssignmentId)===id(a._id)).length;
   if(count<Number(a.weeklyPeriods||0))missing.push({assignmentId:a._id,remaining:Number(a.weeklyPeriods||0)-count});
 }
 if(missing.length)return res.status(409).json({error:'Cannot publish while required lessons are unallocated',missing});

 const constraints=await TimetableConstraint.find({collegeId,isActive:true,type:'unavailable'}).lean();
 const unavailable=targetRows.filter(row=>intervalConstraintBlocked(constraints.filter(c=>id(c.teacherId)===id(row.teacherId)),row.dayOfWeek,row.startMinutes,row.endMinutes));
 if(unavailable.length)return res.status(409).json({error:'Cannot publish because one or more lessons violate teacher unavailable times',lessonIds:unavailable.map(x=>x._id)});

 const q={collegeId,academicSessionId,isActive:true,generationStatus:'draft',sectionId:{$in:scopeSectionIds}};
 const result=await Timetable.updateMany(q,{$set:{generationStatus:'published',publishedAt:new Date(),publishedBy:req.user._id}});
 res.json({ok:true,published:result.modifiedCount||0});
};

exports.wholeGrid=async(req,res)=>{
 const collegeId=cid(req);
 const q={collegeId,isActive:true};
 if(req.query.academicSessionId)q.academicSessionId=req.query.academicSessionId;
 let sectionIds=null;
 if(req.query.scopeType&&req.query.scopeType!=='college'){
   const sections=await generationSections(collegeId,req.query.academicSessionId,req.query.scopeType,req.query.scopeId);
   sectionIds=sections.map(s=>s._id);q.sectionId={$in:sectionIds};
 }
 if(req.query.teacherId)q.teacherId=req.query.teacherId;
 const rows=await Timetable.find(q)
   .populate({path:'sectionId',select:'name programId',populate:{path:'programId',select:'name wingId branchId'}})
   .populate('courseId','name code')
   .populate('teacherId','name employeeNo')
   .populate('divisionId','name code')
   .sort({dayOfWeek:1,startMinutes:1}).lean();
 res.json(rows);
};


exports.verifyDetailed=async(req,res)=>{
 const collegeId=cid(req);
 const academicSessionId=req.query.academicSessionId;
 if(!validId(academicSessionId))return res.status(400).json({error:'Academic Session is required'});

 const scopeType=String(req.query.scopeType||'college');
 const scopeId=scopeType==='college'?null:req.query.scopeId;
 const sections=await generationSections(collegeId,academicSessionId,scopeType,scopeId);
 const sectionIds=sections.map(s=>s._id);
 const sectionIdSet=new Set(sectionIds.map(id));
 const rows=await Timetable.find({collegeId,academicSessionId,sectionId:{$in:sectionIds},isActive:true})
   .populate('sectionId','name programId')
   .populate('courseId','name code')
   .populate('teacherId','name employeeNo')
   .lean();
 const allSessionRows=await Timetable.find({collegeId,academicSessionId,isActive:true})
   .populate('sectionId','name programId')
   .populate('courseId','name code')
   .populate('teacherId','name employeeNo')
   .lean();
 const targetIdSet=new Set(rows.map(r=>id(r._id)));
 const assignments=await TeacherAssignment.find({collegeId,academicSessionId,sectionId:{$in:sectionIds},isActive:true})
   .populate('sectionId','name')
   .populate('courseId','name code')
   .populate('teacherId','name employeeNo')
   .lean();
 const constraints=await TimetableConstraint.find({collegeId,isActive:true}).lean();

 const issues=[];
 const add=(severity,type,message,meta={})=>issues.push({severity,type,message,...meta});

 for(let i=0;i<allSessionRows.length;i++)for(let j=i+1;j<allSessionRows.length;j++){
   const a=allSessionRows[i],b=allSessionRows[j];
   if(!targetIdSet.has(id(a._id))&&!targetIdSet.has(id(b._id)))continue;
   if(Number(a.dayOfWeek)!==Number(b.dayOfWeek)||!overlap(Number(a.startMinutes),Number(a.endMinutes),Number(b.startMinutes),Number(b.endMinutes)))continue;
   if(id(a.teacherId)===id(b.teacherId))add('error','teacher_conflict',`${a.teacherId?.name||'Teacher'} is scheduled in two lessons at the same time, including cross-wing commitments`,{lessonIds:[a._id,b._id]});
   if(id(a.sectionId)===id(b.sectionId)){
     const da=id(a.divisionId),db=id(b.divisionId);
     if(!da||!db||da===db)add('error','section_conflict',`${a.sectionId?.name||'Section'} has overlapping lessons`,{lessonIds:[a._id,b._id]});
   }
   if(a.room&&b.room&&String(a.room).toLowerCase()===String(b.room).toLowerCase())add('error','room_conflict',`${a.room} is used by two lessons at the same time`,{lessonIds:[a._id,b._id]});
 }

 for(const a of assignments){
   const scheduled=rows.filter(r=>id(r.teacherAssignmentId)===id(a._id)).length;
   const required=Number(a.weeklyPeriods||0);
   if(scheduled<required)add('error','missing_lessons',`${a.sectionId?.name}: ${a.courseId?.name} is missing ${required-scheduled} lesson(s)`,{assignmentId:a._id});
   if(scheduled>required)add('warning','extra_lessons',`${a.sectionId?.name}: ${a.courseId?.name} has ${scheduled-required} extra lesson(s)`,{assignmentId:a._id});
 }

 for(const row of rows){
   const teacherRules=constraints.filter(c=>id(c.teacherId)===id(row.teacherId));
   if(intervalConstraintBlocked(teacherRules,row.dayOfWeek,row.startMinutes,row.endMinutes)){
     add('error','teacher_unavailable',`${row.teacherId?.name} is scheduled during an unavailable time`,{lessonId:row._id});
   }
   const consecutiveMax=teacherMaxConsecutive(teacherRules,999);
   if(consecutiveMax<999&&wouldExceedConsecutive(rows.filter(x=>id(x._id)!==id(row._id)),row.teacherId,row.dayOfWeek,row.startMinutes,row.endMinutes,consecutiveMax)){
     add('warning','teacher_consecutive',`${row.teacherId?.name} exceeds maximum consecutive lesson preference`,{teacherId:row.teacherId?._id});
   }
   const max=teacherMaxDaily(teacherRules,999);
   if(max<999){
     const count=rows.filter(x=>id(x.teacherId)===id(row.teacherId)&&Number(x.dayOfWeek)===Number(row.dayOfWeek)).length;
     if(count>max)add('warning','teacher_overload',`${row.teacherId?.name} has ${count} lessons on ${DAY_NAMES[row.dayOfWeek]}, above maximum ${max}`,{teacherId:row.teacherId?._id});
   }
 }

 const uniqueIssues=[];
 const seen=new Set();
 for(const issue of issues){const key=`${issue.type}:${issue.message}`;if(!seen.has(key)){seen.add(key);uniqueIssues.push(issue);}}
 const errors=uniqueIssues.filter(x=>x.severity==='error').length;
 const warnings=uniqueIssues.filter(x=>x.severity==='warning').length;
 const score=Math.max(0,Math.min(100,100-errors*10-warnings*2));
 res.json({valid:errors===0,score,errors,warnings,issues:uniqueIssues,lessons:rows.length,assignments:assignments.length,sections:sections.length});
};

exports.setLessonLock=async(req,res)=>{
 const collegeId=cid(req);
 const lesson=await Timetable.findOne({_id:req.params.id,collegeId,isActive:true});
 if(!lesson)return res.status(404).json({error:'Timetable lesson not found'});
 lesson.isLocked=req.body?.isLocked!==false;
 await lesson.save();
 res.json({ok:true,isLocked:lesson.isLocked});
};



exports.classConstraints=async(req,res)=>{
 const q={collegeId:cid(req),isActive:true};if(validId(req.query.sectionId))q.sectionId=req.query.sectionId;
 const rows=await ClassTimetableConstraint.find(q).populate('sectionId','name programId').sort({createdAt:-1}).lean();res.json(rows);
};
exports.saveClassConstraint=async(req,res)=>{
 const collegeId=cid(req),b=req.body||{};
 const type=String(b.type||'unavailable');
 if(!['unavailable','preferred','max_daily','max_consecutive','relative_unavailable'].includes(type))return res.status(400).json({error:'Invalid class constraint'});
 const applyTo=String(b.applyTo||'single');
 if(!['single','multiple','program','wing','all'].includes(applyTo))return res.status(400).json({error:'Invalid Apply To option'});

 let sectionIds=[];
 if(applyTo==='single'){
   if(!validId(b.sectionId))return res.status(400).json({error:'Class / Section is required'});
   sectionIds=[String(b.sectionId)];
 }else if(applyTo==='multiple'){
   sectionIds=[...new Set((b.sectionIds||[]).filter(validId).map(String))];
   if(!sectionIds.length)return res.status(400).json({error:'Select at least one class / section'});
 }else if(applyTo==='program'){
   if(!validId(b.programId))return res.status(400).json({error:'Program / Class is required'});
   sectionIds=(await Section.find({collegeId,programId:b.programId}).select('_id').lean()).map(x=>String(x._id));
 }else if(applyTo==='wing'){
   if(!validId(b.wingId))return res.status(400).json({error:'Wing is required'});
   const programIds=(await Program.find({collegeId,wingId:b.wingId,isActive:true}).select('_id').lean()).map(x=>x._id);
   sectionIds=(await Section.find({collegeId,programId:{$in:programIds}}).select('_id').lean()).map(x=>String(x._id));
 }else{
   sectionIds=(await Section.find({collegeId}).select('_id').lean()).map(x=>String(x._id));
 }
 if(!sectionIds.length)return res.status(400).json({error:'No sections found for the selected scope'});

 const batchId=`CCR-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
 const docs=[];
 for(const sectionId of sectionIds){
   const payload={collegeId,sectionId,type,note:cleanText(b.note),createdBy:req.user._id,sourceScopeType:applyTo,batchId};
   if(applyTo==='program'&&validId(b.programId))payload.sourceScopeId=b.programId;
   if(applyTo==='wing'&&validId(b.wingId))payload.sourceScopeId=b.wingId;
   if(type==='max_daily')payload.maxPeriodsPerDay=Math.max(1,Math.min(20,Number(b.maxPeriodsPerDay||8)));
   else if(type==='max_consecutive')payload.maxConsecutivePeriods=Math.max(1,Math.min(12,Number(b.maxConsecutivePeriods||4)));
   else if(type==='relative_unavailable'){
     payload.dayOfWeek=Number(b.dayOfWeek);
     payload.relativePosition=['first','last'].includes(String(b.relativePosition))?String(b.relativePosition):'last';
     payload.relativeCount=Math.max(1,Math.min(12,Number(b.relativeCount||1)));
   }else{
     payload.dayOfWeek=Number(b.dayOfWeek);payload.startMinutes=Number(b.startMinutes);payload.endMinutes=Number(b.endMinutes);
     if(payload.endMinutes<=payload.startMinutes)return res.status(400).json({error:'End time must be after start time'});
   }
   docs.push(payload);
 }
 const rows=await ClassTimetableConstraint.insertMany(docs);
 res.json({ok:true,batchId,appliedTo:rows.length,rows});
};
exports.deleteClassConstraint=async(req,res)=>{await ClassTimetableConstraint.updateOne({_id:req.params.id,collegeId:cid(req)},{$set:{isActive:false}});res.json({ok:true});};

exports.divisions=async(req,res)=>{
 const q={collegeId:cid(req),isActive:true};
 if(validId(req.query.sectionId))q.sectionId=req.query.sectionId;
 const rows=await TimetableDivision.find(q)
   .populate({path:'sectionId',select:'name programId academicSessionId',populate:{path:'programId',select:'name code'}})
   .sort({name:1}).lean();
 res.json(rows);
};
exports.saveDivision=async(req,res)=>{
 const b=req.body||{};if(!validId(b.sectionId)||!validId(b.academicSessionId)||!cleanText(b.name))return res.status(400).json({error:'Session, Class / Section and Division Name are required'});
 const row=await TimetableDivision.findOneAndUpdate({collegeId:cid(req),academicSessionId:b.academicSessionId,sectionId:b.sectionId,name:cleanText(b.name)},{$set:{code:cleanText(b.code),isActive:true},$setOnInsert:{createdBy:req.user._id}},{new:true,upsert:true,setDefaultsOnInsert:true});res.json(row);
};
exports.updateDivision=async(req,res)=>{
 const collegeId=cid(req),b=req.body||{};
 if(!cleanText(b.name))return res.status(400).json({error:'Division Name is required'});
 const row=await TimetableDivision.findOne({_id:req.params.id,collegeId,isActive:true});
 if(!row)return res.status(404).json({error:'Division not found'});
 const duplicate=await TimetableDivision.findOne({
   collegeId,
   academicSessionId:row.academicSessionId,
   sectionId:row.sectionId,
   name:cleanText(b.name),
   _id:{$ne:row._id},
   isActive:true
 }).lean();
 if(duplicate)return res.status(409).json({error:'A division with this name already exists for the selected section'});
 row.name=cleanText(b.name);
 row.code=cleanText(b.code);
 await row.save();
 res.json(row);
};

exports.deleteDivision=async(req,res)=>{
 const collegeId=cid(req);const used=await TeacherAssignment.countDocuments({collegeId,divisionId:req.params.id,isActive:true});if(used)return res.status(409).json({error:'Division is used in teacher assignments. Remove those assignments first.'});
 await TimetableDivision.updateOne({_id:req.params.id,collegeId},{$set:{isActive:false}});res.json({ok:true});
};



exports.deleteClassConstraintBatch=async(req,res)=>{
 const result=await ClassTimetableConstraint.updateMany({collegeId:cid(req),batchId:req.params.batchId,isActive:true},{$set:{isActive:false}});
 res.json({ok:true,removed:result.modifiedCount||0});
};
