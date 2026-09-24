const { collegeIdFromRequest: cid, sendError: bad } = require('../../utils/request');
const Hostel=require('../../models/Hostel');
const HostelRoom=require('../../models/HostelRoom');
const HostelAssignment=require('../../models/HostelAssignment');
const HostelComplaint=require('../../models/HostelComplaint');
const HostelAttendance=require('../../models/HostelAttendance');
const HostelVisitor=require('../../models/HostelVisitor');
const HostelSettings=require('../../models/HostelSettings');
const Student=require('../../models/Student');
const Employee=require('../../models/Employee');
const AcademicSession=require('../../models/AcademicSession');
const Branch=require('../../models/Branch');
const Program=require('../../models/Program');
const {audit}=require('../../services/auditService');

function has(user,p){return user?.systemRole==='platform_owner'||(user?.effectivePermissions||[]).includes('*')||(user?.effectivePermissions||[]).includes(p)}
function startOfDay(value){const d=value?new Date(value):new Date();if(Number.isNaN(d.getTime()))return null;d.setHours(0,0,0,0);return d}
function normalizeGender(v){const s=String(v||'').trim().toLowerCase();if(['m','male','boy','boys'].includes(s))return 'male';if(['f','female','girl','girls'].includes(s))return 'female';return s}
function asDate(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d}
function addDays(value,days){const d=new Date(value);d.setDate(d.getDate()+Number(days||0));return d}

async function nextHostelCode(collegeId){
  const rows=await Hostel.find({collegeId,code:/^HST-\d+$/}).select('code').lean();
  const max=rows.reduce((m,x)=>Math.max(m,Number(String(x.code).split('-')[1])||0),0);
  return `HST-${String(max+1).padStart(2,'0')}`;
}
async function nextVisitorNo(collegeId){
  const yy=String(new Date().getFullYear()).slice(-2);
  const prefix=`VIS-${yy}`;
  const last=await HostelVisitor.findOne({collegeId,visitorNo:new RegExp(`^${prefix}`)}).sort({visitorNo:-1}).select('visitorNo').lean();
  const n=last?Number(String(last.visitorNo).slice(prefix.length))||0:0;
  return `${prefix}${String(n+1).padStart(4,'0')}`;
}

async function lookups(req,res){
  const collegeId=cid(req);
  const [branches,employees,sessions,students,programs]=await Promise.all([
    Branch.find({collegeId,isActive:true}).select('name code').sort({name:1}).lean(),
    Employee.find({collegeId,isActive:true}).select('name employeeNo employeeCode mobileNo branchId').sort({name:1}).lean(),
    AcademicSession.find({collegeId}).select('name isCurrent startDate endDate').sort({startDate:-1,name:-1}).lean(),
    Student.find({collegeId,status:'active'}).select('name fatherName admissionNo registrationNo rollNo gender phone programId academicSessionId photoUrl').populate('programId','name code').populate('academicSessionId','name').sort({name:1}).limit(2000).lean(),
    Program.find({collegeId}).select('name code').sort({name:1}).lean()
  ]);
  res.json({branches,employees,sessions,students,programs});
}

async function listHostels(req,res){
  res.json(await Hostel.find({collegeId:cid(req)}).populate('branchId','name code').populate('wardenEmployeeId','name employeeNo employeeCode mobileNo').populate('assistantWardenEmployeeId','name employeeNo employeeCode mobileNo').sort({name:1}));
}
async function createHostel(req,res){
  const collegeId=cid(req);
  const [branch,settings]=await Promise.all([
    Branch.findOne({_id:req.body.branchId,collegeId,isActive:true}),
    HostelSettings.findOne({collegeId}).lean()
  ]);
  if(!branch)return bad(res,'Invalid branch');
  if(settings?.allowMultipleHostelsPerBranch===false){
    const existing=await Hostel.exists({collegeId,branchId:branch._id,isActive:true});
    if(existing)return bad(res,'Only one active hostel is allowed for this branch by Hostel Settings');
  }
  if(req.body.wardenEmployeeId){const e=await Employee.findOne({_id:req.body.wardenEmployeeId,collegeId,isActive:true});if(!e)return bad(res,'Invalid warden employee');}
  if(req.body.assistantWardenEmployeeId){const e=await Employee.findOne({_id:req.body.assistantWardenEmployeeId,collegeId,isActive:true});if(!e)return bad(res,'Invalid assistant warden employee');}
  const payload={...req.body,collegeId,code:await nextHostelCode(collegeId)};
  const doc=await Hostel.create(payload);
  await audit(req,'CREATE_HOSTEL','Hostel',doc._id);
  res.status(201).json(doc);
}
async function updateHostel(req,res){
  const collegeId=cid(req);const payload={...req.body};delete payload.collegeId;delete payload.code;
  const current=await Hostel.findOne({_id:req.params.id,collegeId});if(!current)return bad(res,'Hostel not found',404);
  const nextBranchId=payload.branchId||current.branchId;
  if(payload.branchId){const branch=await Branch.findOne({_id:payload.branchId,collegeId,isActive:true});if(!branch)return bad(res,'Invalid branch');}
  const settings=await HostelSettings.findOne({collegeId}).lean();
  const nextIsActive=payload.isActive!==undefined?payload.isActive:current.isActive;
  if(settings?.allowMultipleHostelsPerBranch===false&&nextIsActive){
    const existing=await Hostel.exists({collegeId,branchId:nextBranchId,isActive:true,_id:{$ne:current._id}});
    if(existing)return bad(res,'Only one active hostel is allowed for this branch by Hostel Settings');
  }
  const doc=await Hostel.findOneAndUpdate({_id:current._id,collegeId},{$set:payload},{new:true,runValidators:true});
  await audit(req,'UPDATE_HOSTEL','Hostel',doc._id);
  res.json(doc);
}

function buildBeds(roomNo,capacity,existing=[]){
  const beds=[];
  for(let i=0;i<capacity;i++){
    const old=existing[i];
    beds.push(old?old:{bedNo:`${roomNo}-B${i+1}`,status:'available'});
  }
  return beds;
}
async function listRooms(req,res){
  const q={collegeId:cid(req)};
  if(req.query.hostelId)q.hostelId=req.query.hostelId;
  if(req.query.status)q.status=req.query.status;
  res.json(await HostelRoom.find(q).populate('hostelId','name code hostelType').sort({roomNo:1}));
}
async function createRoom(req,res){
  const collegeId=cid(req);
  const hostel=await Hostel.findOne({_id:req.body.hostelId,collegeId,isActive:true});
  if(!hostel)return bad(res,'Invalid hostel');
  const rawCapacity=Number(req.body.capacity);
  if(!Number.isInteger(rawCapacity)||rawCapacity<1)return bad(res,'Capacity must be a whole number of at least 1');
  const capacity=rawCapacity;
  const roomNo=String(req.body.roomNo||'').trim();
  if(!roomNo)return bad(res,'Room No is required');
  const beds=buildBeds(roomNo,capacity);
  const doc=await HostelRoom.create({...req.body,collegeId,roomNo,capacity,beds});
  await audit(req,'CREATE_HOSTEL_ROOM','HostelRoom',doc._id,{hostelId:hostel._id});
  res.status(201).json(doc);
}
async function updateRoom(req,res){
  const collegeId=cid(req);
  const doc=await HostelRoom.findOne({_id:req.params.id,collegeId});
  if(!doc)return bad(res,'Room not found',404);
  let nextCapacity=doc.capacity;
  if(req.body.capacity!==undefined){
    const rawCapacity=Number(req.body.capacity);
    if(!Number.isInteger(rawCapacity)||rawCapacity<1)return bad(res,'Capacity must be a whole number of at least 1');
    nextCapacity=rawCapacity;
  }
  if(req.body.hostelId&&String(req.body.hostelId)!==String(doc.hostelId)){
    const targetHostel=await Hostel.findOne({_id:req.body.hostelId,collegeId,isActive:true});
    if(!targetHostel)return bad(res,'Invalid hostel');
    const activeAllocation=await HostelAssignment.exists({collegeId,roomId:doc._id,status:{$in:['reserved','active']}});
    if(activeAllocation)return bad(res,'Room cannot be moved to another hostel while it has active or reserved allocations');
  }
  const protectedBeds=(doc.beds||[]).filter(b=>['occupied','reserved','maintenance','blocked'].includes(b.status));
  if(nextCapacity<protectedBeds.length)return bad(res,`Capacity cannot be reduced below ${protectedBeds.length} because those beds are occupied/reserved/unavailable`);
  const nextRoomNo=String(req.body.roomNo??doc.roomNo).trim();
  if(!nextRoomNo)return bad(res,'Room No is required');
  if(nextCapacity<(doc.beds||[]).length){
    const removable=(doc.beds||[]).filter(b=>b.status==='available');
    const keepProtected=(doc.beds||[]).filter(b=>b.status!=='available');
    doc.beds=[...keepProtected,...removable.slice(0,Math.max(0,nextCapacity-keepProtected.length))];
  }else if(nextCapacity>(doc.beds||[]).length){
    const start=doc.beds.length;
    for(let i=start;i<nextCapacity;i++)doc.beds.push({bedNo:`${nextRoomNo}-B${i+1}`,status:'available'});
  }
  doc.roomNo=nextRoomNo;doc.capacity=nextCapacity;
  for(const key of ['hostelId','roomType','monthlyFee','securityDeposit','status','notes'])if(req.body[key]!==undefined)doc[key]=req.body[key];
  await doc.save();
  await audit(req,'UPDATE_HOSTEL_ROOM','HostelRoom',doc._id);
  res.json(doc);
}

async function listAssignments(req,res){
  const collegeId=cid(req);const q={collegeId};
  if(req.user?.linkedStudentId&&!has(req.user,'VIEW_HOSTEL_REPORTS'))q.studentId=req.user.linkedStudentId;
  if(req.query.status)q.status=req.query.status;
  const docs=await HostelAssignment.find(q).populate('studentId','name fatherName admissionNo registrationNo rollNo gender phone photoUrl programId').populate('hostelId','name code hostelType').populate('roomId','roomNo roomType beds monthlyFee securityDeposit').populate('academicSessionId','name').sort({createdAt:-1});
  res.json(docs);
}
async function allocateStudent(req,res){
  const collegeId=cid(req);const {studentId,hostelId,roomId,bedId,academicSessionId}=req.body;
  const [student,hostel,room,session,settings]=await Promise.all([
    Student.findOne({_id:studentId,collegeId,status:'active'}),Hostel.findOne({_id:hostelId,collegeId,isActive:true}),HostelRoom.findOne({_id:roomId,collegeId,hostelId,status:'active'}),AcademicSession.findOne({_id:academicSessionId,collegeId}),HostelSettings.findOne({collegeId}).lean()
  ]);
  if(!student)return bad(res,'Invalid student');if(!hostel)return bad(res,'Invalid hostel');if(!room)return bad(res,'Invalid hostel room');if(!session)return bad(res,'Invalid academic session');
  if(settings?.allowStudentAllocation===false)return bad(res,'Student hostel allocation is disabled in Hostel Settings');
  const allocationStatus=req.body.status==='reserved'?'reserved':'active';
  if(allocationStatus==='reserved'&&settings?.allowBedReservation===false)return bad(res,'Bed reservation is disabled in Hostel Settings');
  const checkInDate=asDate(req.body.checkInDate)||new Date();
  if(req.body.checkInDate&&!asDate(req.body.checkInDate))return bad(res,'Invalid allocation date');
  let expectedCheckOutDate=asDate(req.body.expectedCheckOutDate);
  if(req.body.expectedCheckOutDate&&!expectedCheckOutDate)return bad(res,'Invalid expected leaving date');
  if(!expectedCheckOutDate&&Number(settings?.defaultAllocationDays||0)>0)expectedCheckOutDate=addDays(checkInDate,settings.defaultAllocationDays);
  if(settings?.requireExpectedVacatingDate&&!expectedCheckOutDate)return bad(res,'Expected leaving date is required by Hostel Settings');
  if(expectedCheckOutDate&&expectedCheckOutDate<checkInDate)return bad(res,'Expected leaving date cannot be before allocation date');
  const requireMatch=settings?.requireGenderMatching!==false;
  const sg=normalizeGender(student.gender);
  if(requireMatch&&hostel.hostelType==='boys'&&sg==='female')return bad(res,'Female student cannot be allocated to a Boys Hostel');
  if(requireMatch&&hostel.hostelType==='girls'&&sg==='male')return bad(res,'Male student cannot be allocated to a Girls Hostel');
  if(hostel.hostelType==='staff')return bad(res,'Student allocation is not allowed in a Staff Hostel');
  const bed=room.beds.id(bedId);if(!bed)return bad(res,'Invalid bed');if(bed.status!=='available')return bad(res,'Selected bed is not available');
  const existing=await HostelAssignment.findOne({collegeId,studentId,status:{$in:['reserved','active']}});if(existing)return bad(res,'Student already has an active hostel allocation');
  const occupied=await HostelAssignment.exists({collegeId,roomId,bedId,status:{$in:['reserved','active']}});if(occupied)return bad(res,'Bed is already allocated');
  const monthlyFee=req.body.monthlyFee===undefined?Number(room.monthlyFee||0):Number(req.body.monthlyFee);
  const securityDeposit=req.body.securityDeposit===undefined?Number(room.securityDeposit||0):Number(req.body.securityDeposit);
  if(!Number.isFinite(monthlyFee)||monthlyFee<0)return bad(res,'Monthly fee must be zero or greater');
  if(!Number.isFinite(securityDeposit)||securityDeposit<0)return bad(res,'Security deposit must be zero or greater');
  if(settings?.securityDepositRequired&&securityDeposit<=0)return bad(res,'Security deposit is required by Hostel Settings');
  bed.status=allocationStatus==='reserved'?'reserved':'occupied';await room.save();
  const doc=await HostelAssignment.create({collegeId,studentId,hostelId,roomId,bedId,academicSessionId,checkInDate,expectedCheckOutDate,monthlyFee,securityDeposit,status:allocationStatus,assignedBy:req.user._id,notes:req.body.notes});
  await audit(req,'ALLOCATE_HOSTEL','HostelAssignment',doc._id,{studentId,hostelId,roomId,bedId,status:allocationStatus});res.status(201).json(doc);
}
async function checkOut(req,res){
  const collegeId=cid(req);const assignment=await HostelAssignment.findOne({_id:req.params.id,collegeId,status:{$in:['reserved','active']}});if(!assignment)return bad(res,'Active hostel allocation not found',404);
  const checkOutDate=asDate(req.body?.checkOutDate)||new Date();
  if(req.body?.checkOutDate&&!asDate(req.body.checkOutDate))return bad(res,'Invalid vacating date');
  if(checkOutDate<new Date(assignment.checkInDate))return bad(res,'Vacating date cannot be before allocation date');
  assignment.status='checked_out';assignment.checkOutDate=checkOutDate;assignment.checkedOutBy=req.user._id;if(req.body?.notes)assignment.notes=[assignment.notes,req.body.notes].filter(Boolean).join('\n');await assignment.save();
  const room=await HostelRoom.findOne({_id:assignment.roomId,collegeId});const bed=room?.beds?.id(assignment.bedId);if(bed){bed.status=req.body?.bedStatus==='maintenance'?'maintenance':'available';await room.save();}
  await audit(req,'HOSTEL_CHECKOUT','HostelAssignment',assignment._id,{bedStatus:req.body?.bedStatus==='maintenance'?'maintenance':'available'});res.json(assignment);
}

async function listAttendance(req,res){
  const q={collegeId:cid(req)};if(req.query.hostelId)q.hostelId=req.query.hostelId;if(req.query.date){const d=startOfDay(req.query.date);if(!d)return bad(res,'Invalid date');q.date=d;}
  res.json(await HostelAttendance.find(q).populate('studentId','name rollNo admissionNo').populate('hostelId','name code').populate('roomId','roomNo').sort({date:-1,createdAt:-1}));
}
async function saveAttendance(req,res){
  const collegeId=cid(req);const settings=await HostelSettings.findOne({collegeId}).lean();if(settings?.attendanceEnabled===false)return bad(res,'Hostel attendance is disabled in Hostel Settings');
  const date=startOfDay(req.body.date);if(!date)return bad(res,'Invalid attendance date');const rows=Array.isArray(req.body.rows)?req.body.rows:[];if(!rows.length)return bad(res,'Attendance rows are required');
  const allowedStatuses=new Set(settings?.allowNightOut===false?['present','absent','leave']:['present','absent','leave','night_out']);
  const saved=[];const skipped=[];
  // Load active allocations once instead of one allocation query per attendance row.
  const studentIds=[...new Set(rows.map(row=>String(row.studentId||'')).filter(Boolean))];
  const allocations=await HostelAssignment.find({collegeId,studentId:{$in:studentIds},status:'active'})
    .select('studentId hostelId roomId').lean();
  const allocationByStudent=new Map(allocations.map(a=>[String(a.studentId),a]));
  for(const row of rows){
    const status=String(row.status||'present');
    if(!allowedStatuses.has(status))return bad(res,status==='night_out'?'Night Out attendance is disabled in Hostel Settings':'Invalid hostel attendance status');
    const allocation=allocationByStudent.get(String(row.studentId||''));
    if(!allocation){skipped.push(row.studentId);continue;}
    const doc=await HostelAttendance.findOneAndUpdate({collegeId,studentId:row.studentId,date},{$set:{hostelId:allocation.hostelId,roomId:allocation.roomId,status,inTime:String(row.inTime||'').trim(),outTime:String(row.outTime||'').trim(),remarks:String(row.remarks||'').trim(),markedBy:req.user._id}},{upsert:true,new:true,runValidators:true});saved.push(doc);
  }
  await audit(req,'MARK_HOSTEL_ATTENDANCE','HostelAttendance',null,{date,rows:saved.length,skipped:skipped.length});res.json({rows:saved,skipped});
}

async function listVisitors(req,res){
  const q={collegeId:cid(req)};if(req.query.status)q.status=req.query.status;if(req.query.hostelId)q.hostelId=req.query.hostelId;
  res.json(await HostelVisitor.find(q).populate('studentId','name rollNo admissionNo').populate('hostelId','name code').populate('roomId','roomNo').sort({checkInAt:-1}));
}
async function createVisitor(req,res){
  const collegeId=cid(req);const settings=await HostelSettings.findOne({collegeId}).lean();
  if(settings?.visitorRegisterRequired===false)return bad(res,'Visitor register is disabled in Hostel Settings');
  const allocation=await HostelAssignment.findOne({collegeId,studentId:req.body.studentId,status:'active'});if(!allocation)return bad(res,'Selected student has no active hostel allocation');
  if(!String(req.body.visitorName||'').trim())return bad(res,'Visitor name is required');
  if(!String(req.body.mobileNo||'').trim())return bad(res,'Visitor mobile number is required');
  if(settings?.visitorCnicRequired&&!String(req.body.cnic||'').trim())return bad(res,'Visitor CNIC is required');
  if(settings?.requireVisitorAuthorization&&!String(req.body.authorizedBy||'').trim())return bad(res,'Visitor authorization is required');
  const checkInAt=asDate(req.body.checkInAt)||new Date();if(req.body.checkInAt&&!asDate(req.body.checkInAt))return bad(res,'Invalid visitor check-in time');
  const doc=await HostelVisitor.create({...req.body,visitorName:String(req.body.visitorName).trim(),mobileNo:String(req.body.mobileNo).trim(),cnic:String(req.body.cnic||'').trim(),collegeId,visitorNo:await nextVisitorNo(collegeId),hostelId:allocation.hostelId,roomId:allocation.roomId,createdBy:req.user._id,status:'inside',checkInAt});await audit(req,'CREATE_HOSTEL_VISITOR','HostelVisitor',doc._id);res.status(201).json(doc);
}
async function checkOutVisitor(req,res){
  const collegeId=cid(req);const doc=await HostelVisitor.findOne({_id:req.params.id,collegeId,status:'inside'});if(!doc)return bad(res,'Active visitor entry not found',404);
  const checkOutAt=asDate(req.body?.checkOutAt)||new Date();if(req.body?.checkOutAt&&!asDate(req.body.checkOutAt))return bad(res,'Invalid visitor check-out time');if(checkOutAt<new Date(doc.checkInAt))return bad(res,'Visitor check-out time cannot be before check-in time');
  doc.status='checked_out';doc.checkOutAt=checkOutAt;await doc.save();await audit(req,'HOSTEL_VISITOR_CHECKOUT','HostelVisitor',doc._id);res.json(doc);
}

async function listComplaints(req,res){
  const q={collegeId:cid(req)};if(req.user?.linkedStudentId&&!has(req.user,'VIEW_HOSTEL_REPORTS'))q.studentId=req.user.linkedStudentId;if(req.query.status)q.status=req.query.status;if(req.query.hostelId)q.hostelId=req.query.hostelId;
  res.json(await HostelComplaint.find(q).populate('hostelId','name code').populate('roomId','roomNo').populate('studentId','name admissionNo rollNo').populate('assignedToEmployeeId','name employeeNo employeeCode').sort({createdAt:-1}));
}
async function createComplaint(req,res){
  const collegeId=cid(req);let studentId=req.body.studentId;if(req.user?.linkedStudentId)studentId=req.user.linkedStudentId;if(!studentId)return bad(res,'studentId is required');const allocation=await HostelAssignment.findOne({collegeId,studentId,status:'active'});if(!allocation)return bad(res,'Student has no active hostel allocation');
  const doc=await HostelComplaint.create({collegeId,hostelId:allocation.hostelId,roomId:allocation.roomId,studentId,category:req.body.category||'other',title:req.body.title,description:req.body.description,priority:req.body.priority||'medium',status:'open',createdBy:req.user._id});await audit(req,'CREATE_HOSTEL_COMPLAINT','HostelComplaint',doc._id);res.status(201).json(doc);
}
async function updateComplaint(req,res){
  const collegeId=cid(req);const doc=await HostelComplaint.findOne({_id:req.params.id,collegeId});if(!doc)return bad(res,'Complaint not found',404);
  if(req.user?.linkedStudentId&&!has(req.user,'MANAGE_HOSTEL_COMPLAINTS')){if(String(doc.studentId)!==String(req.user.linkedStudentId))return bad(res,'Access denied',403);if(doc.status!=='open')return bad(res,'Complaint can no longer be edited');doc.title=req.body.title??doc.title;doc.description=req.body.description??doc.description;doc.category=req.body.category??doc.category;}else{for(const k of ['status','assignedToEmployeeId','resolutionNotes','priority'])if(req.body[k]!==undefined)doc[k]=req.body[k]||undefined;if(['resolved','closed'].includes(doc.status)&&!doc.resolvedAt)doc.resolvedAt=new Date();}
  await doc.save();await audit(req,'UPDATE_HOSTEL_COMPLAINT','HostelComplaint',doc._id,{status:doc.status});res.json(doc);
}

async function getSettings(req,res){const collegeId=cid(req);let doc=await HostelSettings.findOne({collegeId});if(!doc)doc=await HostelSettings.create({collegeId});res.json(doc);}
async function updateSettings(req,res){const collegeId=cid(req);const payload={...req.body};delete payload.collegeId;const doc=await HostelSettings.findOneAndUpdate({collegeId},{$set:payload},{upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true});await audit(req,'UPDATE_HOSTEL_SETTINGS','HostelSettings',doc._id);res.json(doc);}

async function fees(req,res){
  const docs=await HostelAssignment.find({collegeId:cid(req),status:{$in:['reserved','active']}}).populate('studentId','name rollNo admissionNo').populate('hostelId','name code').populate('roomId','roomNo').sort({createdAt:-1});
  const rows=docs.map(a=>({assignmentId:a._id,student:a.studentId,hostel:a.hostelId,room:a.roomId,monthlyFee:Number(a.monthlyFee||0),securityDeposit:Number(a.securityDeposit||0),status:a.status,checkInDate:a.checkInDate}));
  res.json({rows,monthlyTotal:rows.reduce((s,x)=>s+x.monthlyFee,0),securityTotal:rows.reduce((s,x)=>s+x.securityDeposit,0),note:'Hostel fee amounts are defined here from active allocations. Voucher generation, collection, posting, arrears and payment processing are handled centrally in the Fees module.'});
}

async function reports(req,res){
  const collegeId=cid(req);const [hostels,rooms,allocations,attendance,visitors,complaints,settings]=await Promise.all([Hostel.find({collegeId}).populate('branchId','name code').lean(),HostelRoom.find({collegeId}).populate('hostelId','name code').lean(),HostelAssignment.find({collegeId}).populate('studentId','name rollNo admissionNo').populate('hostelId','name code').populate('roomId','roomNo').lean(),HostelAttendance.find({collegeId}).populate('studentId','name rollNo').populate('hostelId','name code').populate('roomId','roomNo').sort({date:-1}).limit(500).lean(),HostelVisitor.find({collegeId}).populate('studentId','name rollNo').populate('hostelId','name code').populate('roomId','roomNo').sort({checkInAt:-1}).limit(500).lean(),HostelComplaint.find({collegeId}).populate('studentId','name rollNo').populate('hostelId','name code').populate('roomId','roomNo').sort({createdAt:-1}).limit(500).lean(),HostelSettings.findOne({collegeId}).lean()]);
  const activeByBed=new Map();for(const a of allocations.filter(x=>['active','reserved'].includes(x.status)))activeByBed.set(`${a.roomId?._id||a.roomId}:${a.bedId}`,a.status);
  const occupancy=rooms.map(r=>{let occupied=0,reserved=0,available=0,unavailable=0,mismatches=0;for(const b of r.beds||[]){const actual=activeByBed.get(`${r._id}:${b._id}`);if(actual==='active')occupied++;else if(actual==='reserved')reserved++;else if(['maintenance','blocked'].includes(b.status))unavailable++;else available++;if((actual==='active'&&b.status!=='occupied')||(actual==='reserved'&&b.status!=='reserved')||(!actual&&['occupied','reserved'].includes(b.status)))mismatches++;}return {...r,occupancy:{occupied,reserved,available,unavailable,mismatches}};});
  const maxMinutes=Number(settings?.maximumVisitMinutes||0);const now=Date.now();const overdueVisitors=visitors.filter(v=>v.status==='inside'&&maxMinutes>0&&(now-new Date(v.checkInAt).getTime())>maxMinutes*60000).map(v=>v._id);
  res.json({hostels,rooms:occupancy,allocations,attendance,visitors,complaints,summary:{occupancyMismatches:occupancy.reduce((s,r)=>s+r.occupancy.mismatches,0),overdueVisitors:overdueVisitors.length},overdueVisitorIds:overdueVisitors});
}

async function myHostel(req,res){if(!req.user?.linkedStudentId)return bad(res,'Student account required',403);const allocation=await HostelAssignment.findOne({collegeId:cid(req),studentId:req.user.linkedStudentId,status:'active'}).populate('hostelId','name code address contactPhone').populate('roomId','roomNo roomType beds').populate('academicSessionId','name').lean();res.json(allocation?{allocation}:null);}

async function dashboard(req,res){
  const collegeId=cid(req);const rooms=await HostelRoom.find({collegeId,status:'active'}).lean();let beds=0,maintenance=0,blocked=0;for(const room of rooms){for(const bed of room.beds||[]){beds++;if(bed.status==='maintenance')maintenance++;if(bed.status==='blocked')blocked++;}}
  const [hostels,activeAllocations,pendingAllocations,openComplaints,insideVisitors,settings,active]=await Promise.all([Hostel.countDocuments({collegeId,isActive:true}),HostelAssignment.countDocuments({collegeId,status:'active'}),HostelAssignment.countDocuments({collegeId,status:'reserved'}),HostelComplaint.countDocuments({collegeId,status:{$in:['open','in_progress']}}),HostelVisitor.countDocuments({collegeId,status:'inside'}),HostelSettings.findOne({collegeId}).lean(),HostelAssignment.find({collegeId,status:'active'}).select('monthlyFee securityDeposit').lean()]);
  const occupied=activeAllocations,reserved=pendingAllocations,available=Math.max(0,beds-occupied-reserved-maintenance-blocked);
  let overdueVisitors=0;const maxMinutes=Number(settings?.maximumVisitMinutes||0);if(maxMinutes>0)overdueVisitors=await HostelVisitor.countDocuments({collegeId,status:'inside',checkInAt:{$lt:new Date(Date.now()-maxMinutes*60000)}});
  res.json({hostels,rooms:rooms.length,beds,availableBeds:available,occupiedBeds:occupied,reservedBeds:reserved,maintenanceBeds:maintenance,blockedBeds:blocked,activeAllocations,pendingAllocations,openComplaints,insideVisitors,overdueVisitors,monthlyHostelFees:active.reduce((s,x)=>s+Number(x.monthlyFee||0),0),securityDeposits:active.reduce((s,x)=>s+Number(x.securityDeposit||0),0)});
}

module.exports={lookups,listHostels,createHostel,updateHostel,listRooms,createRoom,updateRoom,listAssignments,allocateStudent,checkOut,listAttendance,saveAttendance,listVisitors,createVisitor,checkOutVisitor,listComplaints,createComplaint,updateComplaint,getSettings,updateSettings,fees,reports,myHostel,dashboard};
