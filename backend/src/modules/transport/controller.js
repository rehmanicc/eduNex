const { collegeIdFromRequest: cid, sendError: bad } = require('../../utils/request');
const TransportVehicle=require('../../models/TransportVehicle');
const TransportRoute=require('../../models/TransportRoute');
const TransportAssignment=require('../../models/TransportAssignment');
const TransportMaintenance=require('../../models/TransportMaintenance');
const TransportSettings=require('../../models/TransportSettings');
const Student=require('../../models/Student');
const Employee=require('../../models/Employee');
const AcademicSession=require('../../models/AcademicSession');
const Program=require('../../models/Program');
const {audit}=require('../../services/auditService');

function has(user,p){return user?.systemRole==='platform_owner'||(user?.effectivePermissions||[]).includes('*')||(user?.effectivePermissions||[]).includes(p)}
function cleanBody(body,allowed){const out={};for(const k of allowed)if(Object.prototype.hasOwnProperty.call(body||{},k))out[k]=body[k];return out}
function asDate(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d}
function positiveInt(value){const n=Number(value);return Number.isInteger(n)&&n>0?n:null}
async function activePassengerCountForVehicle(collegeId,vehicleId,excludeRouteId=null){
  if(!vehicleId)return 0;
  const routeQuery={collegeId,vehicleId,isActive:true};
  if(excludeRouteId)routeQuery._id={$ne:excludeRouteId};
  const routeIds=await TransportRoute.find(routeQuery).distinct('_id');
  if(!routeIds.length)return 0;
  return TransportAssignment.countDocuments({collegeId,routeId:{$in:routeIds},status:'active'});
}

async function nextCode(Model,collegeId,field,prefix,width=2){
  const rows=await Model.find({collegeId,[field]:new RegExp(`^${prefix}-\\d+$`,'i')}).select(field).lean();
  let max=0;
  for(const row of rows){const n=Number(String(row[field]||'').split('-').pop());if(Number.isFinite(n))max=Math.max(max,n)}
  return `${prefix}-${String(max+1).padStart(width,'0')}`;
}
async function settingsFor(collegeId){
  if(!collegeId)throw new Error('College context is required for transport settings');

  // Transport settings are one-per-college. Multiple dashboard/settings requests can
  // arrive together, so a find-then-create sequence can race and hit E11000.
  // Use an atomic upsert and, if another request wins the race at the unique index,
  // simply return the row that now exists.
  try{
    return await TransportSettings.findOneAndUpdate(
      {collegeId},
      {$setOnInsert:{collegeId}},
      {new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true}
    );
  }catch(err){
    if(err?.code===11000){
      const existing=await TransportSettings.findOne({collegeId});
      if(existing)return existing;
    }
    throw err;
  }
}

async function lookups(req,res){
  const collegeId=cid(req);
  const [sessions,programs,students,employees]=await Promise.all([
    AcademicSession.find({collegeId}).sort({name:-1}).lean(),
    Program.find({collegeId,isActive:true}).sort({name:1}).lean(),
    Student.find({collegeId,status:'active'}).select('name fatherName admissionNo registrationNo rollNo programId academicSessionId').sort({name:1}).lean(),
    Employee.find({collegeId,isActive:true}).select('name employeeCode employeeNo designation category mobile phone').sort({name:1}).lean()
  ]);
  res.json({sessions,programs,students,employees});
}

async function listVehicles(req,res){
  const collegeId=cid(req);
  const vehicles=await TransportVehicle.find({collegeId})
    .populate('driverEmployeeId conductorEmployeeId','name employeeCode employeeNo mobile phone')
    .sort({vehicleCode:1});
  const counts=await TransportRoute.aggregate([
    {$match:{collegeId,vehicleId:{$ne:null}}},
    {$lookup:{from:'transportassignments',localField:'_id',foreignField:'routeId',as:'assignments'}},
    {$project:{vehicleId:1,active:{$size:{$filter:{input:'$assignments',as:'a',cond:{$eq:['$$a.status','active']}}}}}},
    {$group:{_id:'$vehicleId',active:{$sum:'$active'}}}
  ]);
  const map=new Map(counts.map(x=>[String(x._id),x.active]));
  res.json(vehicles.map(v=>({...v.toObject(),occupiedSeats:map.get(String(v._id))||0,availableSeats:Math.max(0,v.seatingCapacity-(map.get(String(v._id))||0))})));
}

async function createVehicle(req,res){
  const collegeId=cid(req);
  const payload=cleanBody(req.body,['registrationNo','vehicleType','make','model','year','seatingCapacity','driverEmployeeId','conductorEmployeeId','insuranceExpiry','fitnessExpiry','permitExpiry','odometer','status','notes']);
  const capacity=positiveInt(payload.seatingCapacity);if(!capacity)return bad(res,'Seating capacity must be a whole number of at least 1');payload.seatingCapacity=capacity;
  payload.registrationNo=String(payload.registrationNo||'').trim();if(!payload.registrationNo)return bad(res,'Registration No is required');
  if(payload.driverEmployeeId){const e=await Employee.findOne({_id:payload.driverEmployeeId,collegeId,isActive:true});if(!e)return bad(res,'Invalid driver employee');}
  if(payload.conductorEmployeeId){const e=await Employee.findOne({_id:payload.conductorEmployeeId,collegeId,isActive:true});if(!e)return bad(res,'Invalid conductor/helper employee');}
  if(payload.driverEmployeeId&&payload.conductorEmployeeId&&String(payload.driverEmployeeId)===String(payload.conductorEmployeeId))return bad(res,'Driver and conductor/helper must be different employees');
  payload.vehicleCode=await nextCode(TransportVehicle,collegeId,'vehicleCode','VEH',2);
  const doc=await TransportVehicle.create({...payload,collegeId});
  await audit(req,'CREATE_TRANSPORT_VEHICLE','TransportVehicle',doc._id);
  res.status(201).json(doc);
}

async function updateVehicle(req,res){
  const collegeId=cid(req);
  const payload=cleanBody(req.body,['registrationNo','vehicleType','make','model','year','seatingCapacity','driverEmployeeId','conductorEmployeeId','insuranceExpiry','fitnessExpiry','permitExpiry','odometer','status','notes']);
  const current=await TransportVehicle.findOne({_id:req.params.id,collegeId});
  if(!current)return bad(res,'Vehicle not found',404);
  if(payload.seatingCapacity!=null){const capacity=positiveInt(payload.seatingCapacity);if(!capacity)return bad(res,'Seating capacity must be a whole number of at least 1');payload.seatingCapacity=capacity;}
  if(payload.registrationNo!==undefined){payload.registrationNo=String(payload.registrationNo||'').trim();if(!payload.registrationNo)return bad(res,'Registration No is required');}
  if(payload.driverEmployeeId){const e=await Employee.findOne({_id:payload.driverEmployeeId,collegeId,isActive:true});if(!e)return bad(res,'Invalid driver employee');}
  if(payload.conductorEmployeeId){const e=await Employee.findOne({_id:payload.conductorEmployeeId,collegeId,isActive:true});if(!e)return bad(res,'Invalid conductor/helper employee');}
  const nextDriver=payload.driverEmployeeId!==undefined?payload.driverEmployeeId:current.driverEmployeeId;
  const nextConductor=payload.conductorEmployeeId!==undefined?payload.conductorEmployeeId:current.conductorEmployeeId;
  if(nextDriver&&nextConductor&&String(nextDriver)===String(nextConductor))return bad(res,'Driver and conductor/helper must be different employees');
  const occupied=await activePassengerCountForVehicle(collegeId,current._id);
  if(payload.seatingCapacity!=null&&payload.seatingCapacity<occupied)return bad(res,`Capacity cannot be lower than ${occupied} active passengers`,409);
  if(payload.status&&payload.status!=='active'&&occupied>0)return bad(res,`Vehicle cannot be set to ${payload.status} while ${occupied} active passenger(s) are assigned`,409);
  Object.assign(current,payload);await current.save();
  await audit(req,'UPDATE_TRANSPORT_VEHICLE','TransportVehicle',current._id);
  res.json(current);
}

async function listRoutes(req,res){
  const collegeId=cid(req);
  const docs=await TransportRoute.find({collegeId}).populate('vehicleId','vehicleCode registrationNo vehicleType seatingCapacity status').sort({name:1});
  const routeIds=docs.map(x=>x._id);
  const counts=await TransportAssignment.aggregate([{$match:{collegeId,routeId:{$in:routeIds},status:'active'}},{$group:{_id:'$routeId',count:{$sum:1}}}]);
  const map=new Map(counts.map(x=>[String(x._id),x.count]));
  const vehicleIds=[...new Set(docs.map(r=>String(r.vehicleId?._id||'')).filter(Boolean))];
  const vehicleOccupancy=new Map();
  for(const vehicleId of vehicleIds)vehicleOccupancy.set(vehicleId,await activePassengerCountForVehicle(collegeId,vehicleId));
  res.json(docs.map(r=>{const obj=r.toObject();if(obj.vehicleId){const occupiedSeats=vehicleOccupancy.get(String(obj.vehicleId._id))||0;obj.vehicleId.occupiedSeats=occupiedSeats;obj.vehicleId.availableSeats=Math.max(0,Number(obj.vehicleId.seatingCapacity||0)-occupiedSeats);}return {...obj,activePassengers:map.get(String(r._id))||0};}));
}

async function createRoute(req,res){
  const collegeId=cid(req);
  const payload=cleanBody(req.body,['name','vehicleId','stops','startPoint','endPoint','defaultMonthlyFee','isActive']);
  payload.name=String(payload.name||'').trim();if(!payload.name)return bad(res,'Route name is required');
  if(payload.vehicleId){const vehicle=await TransportVehicle.findOne({_id:payload.vehicleId,collegeId,status:'active'});if(!vehicle)return bad(res,'Select an active vehicle');}
  payload.code=await nextCode(TransportRoute,collegeId,'code','RT',2);
  payload.stops=[...(payload.stops||[])].filter(s=>String(s?.name||'').trim()).map((s,i)=>({...s,name:String(s.name).trim(),sequence:i+1}));
  if(!payload.stops.length)return bad(res,'At least one route stop is required');
  const doc=await TransportRoute.create({...payload,collegeId});
  await audit(req,'CREATE_TRANSPORT_ROUTE','TransportRoute',doc._id);
  res.status(201).json(doc);
}

async function updateRoute(req,res){
  const collegeId=cid(req);
  const current=await TransportRoute.findOne({_id:req.params.id,collegeId});if(!current)return bad(res,'Route not found',404);
  const payload=cleanBody(req.body,['name','vehicleId','stops','startPoint','endPoint','defaultMonthlyFee','isActive']);
  if(payload.name!==undefined){payload.name=String(payload.name||'').trim();if(!payload.name)return bad(res,'Route name is required');}
  const activePassengers=await TransportAssignment.countDocuments({collegeId,routeId:current._id,status:'active'});
  if(payload.isActive===false&&activePassengers>0)return bad(res,`Route cannot be made inactive while ${activePassengers} active passenger(s) are assigned`,409);
  if(Object.prototype.hasOwnProperty.call(payload,'vehicleId')){
    if(!payload.vehicleId&&activePassengers>0)return bad(res,'Vehicle cannot be removed while the route has active passengers',409);
    if(payload.vehicleId){
      const vehicle=await TransportVehicle.findOne({_id:payload.vehicleId,collegeId,status:'active'});if(!vehicle)return bad(res,'Select an active vehicle');
      if(String(payload.vehicleId)!==String(current.vehicleId||'')&&activePassengers>0){
        const occupiedElsewhere=await activePassengerCountForVehicle(collegeId,vehicle._id,current._id);
        if(occupiedElsewhere+activePassengers>Number(vehicle.seatingCapacity||0))return bad(res,`Selected vehicle has only ${Math.max(0,Number(vehicle.seatingCapacity||0)-occupiedElsewhere)} seat(s) available for ${activePassengers} active route passenger(s)`,409);
      }
    }
  }
  if(payload.stops){
    const normalized=[...payload.stops].filter(s=>String(s?.name||'').trim()).map((s,i)=>({...s,name:String(s.name).trim(),sequence:i+1}));
    if(!normalized.length)return bad(res,'At least one route stop is required');
    const activeStopIds=await TransportAssignment.find({collegeId,routeId:current._id,status:'active'}).distinct('stopId');
    const submittedIds=new Set(normalized.map(s=>String(s._id||'')).filter(Boolean));
    const missing=activeStopIds.filter(id=>!submittedIds.has(String(id)));
    if(missing.length)return bad(res,'A stop used by an active passenger cannot be removed. End or change the assignment first.',409);
    payload.stops=normalized;
  }
  const doc=await TransportRoute.findOneAndUpdate({_id:current._id,collegeId},{$set:payload},{new:true,runValidators:true});
  await audit(req,'UPDATE_TRANSPORT_ROUTE','TransportRoute',doc._id);
  res.json(doc);
}

async function listAssignments(req,res){
  const collegeId=cid(req),q={collegeId};
  if(req.user?.linkedStudentId&&!has(req.user,'VIEW_TRANSPORT_REPORTS'))q.studentId=req.user.linkedStudentId;
  if(req.query.status)q.status=req.query.status;
  if(req.query.routeId)q.routeId=req.query.routeId;
  const docs=await TransportAssignment.find(q)
    .populate('studentId','name fatherName admissionNo registrationNo rollNo programId academicSessionId')
    .populate({path:'routeId',select:'name code stops vehicleId',populate:{path:'vehicleId',select:'vehicleCode registrationNo seatingCapacity status'}})
    .populate('academicSessionId','name').sort({createdAt:-1});
  res.json(docs);
}

async function assignStudent(req,res){
  const collegeId=cid(req);
  const {studentId,routeId,stopId,academicSessionId}=req.body;
  const [student,route,session,settings]=await Promise.all([
    Student.findOne({_id:studentId,collegeId,status:'active'}),
    TransportRoute.findOne({_id:routeId,collegeId,isActive:true}).populate('vehicleId'),
    AcademicSession.findOne({_id:academicSessionId,collegeId}),
    settingsFor(collegeId)
  ]);
  if(!student)return bad(res,'Invalid student');
  if(!route)return bad(res,'Invalid route');
  if(!session)return bad(res,'Invalid academic session');
  if(String(student.academicSessionId||'')!==String(session._id))return bad(res,'Student does not belong to selected session');
  const stop=route.stops.id(stopId);if(!stop)return bad(res,'Invalid route stop');
  if(!route.vehicleId||route.vehicleId.status!=='active')return bad(res,'Selected route has no active vehicle assigned',409);
  const status=req.body.status==='paused'?'paused':'active';
  const existing=await TransportAssignment.findOne({collegeId,studentId,status:'active'});
  if(existing&&!settings.allowRouteChange)return bad(res,'Student already has an active transport assignment',409);
  if(existing&&String(existing.routeId)===String(route._id)&&String(existing.stopId)===String(stop._id))return bad(res,'Student is already actively assigned to this route and stop',409);
  if(settings.enforceCapacity&&status==='active'){
    const occupied=await activePassengerCountForVehicle(collegeId,route.vehicleId._id);
    const sameVehicleExisting=existing&&String((await TransportRoute.findOne({_id:existing.routeId,collegeId}).select('vehicleId').lean())?.vehicleId||'')===String(route.vehicleId._id);
    const effectiveOccupied=Math.max(0,occupied-(sameVehicleExisting?1:0));
    if(effectiveOccupied>=Number(route.vehicleId.seatingCapacity||0))return bad(res,'Vehicle seating capacity is full',409);
  }
  const startDate=asDate(req.body.startDate)||new Date();if(req.body.startDate&&!asDate(req.body.startDate))return bad(res,'Invalid transport start date');
  const endDate=asDate(req.body.endDate);if(req.body.endDate&&!endDate)return bad(res,'Invalid transport end date');if(endDate&&endDate<startDate)return bad(res,'End date cannot be before start date');
  const feeOverride=req.body.monthlyFee;
  const monthlyFee=settings.allowFeeOverride&&feeOverride!==undefined&&feeOverride!==''?Number(feeOverride):(Number(stop.monthlyFee)||Number(route.defaultMonthlyFee)||0);
  if(!Number.isFinite(monthlyFee)||monthlyFee<0)return bad(res,'Monthly fee must be zero or greater');
  const doc=await TransportAssignment.create({collegeId,studentId,routeId,stopId,academicSessionId,startDate,endDate:endDate||undefined,monthlyFee,pickupType:req.body.pickupType||'both',notes:req.body.notes||'',status,assignedBy:req.user._id});
  if(existing){existing.status='ended';existing.endDate=startDate;await existing.save();}
  await audit(req,'ASSIGN_STUDENT_TRANSPORT','TransportAssignment',doc._id,{studentId,routeId,stopId,replacedAssignmentId:existing?._id||null});
  res.status(201).json(doc);
}

async function endAssignment(req,res){
  const collegeId=cid(req);const doc=await TransportAssignment.findOne({_id:req.params.id,collegeId,status:{$in:['active','paused']}});if(!doc)return bad(res,'Active transport assignment not found',404);
  const endDate=asDate(req.body?.endDate)||new Date();if(req.body?.endDate&&!asDate(req.body.endDate))return bad(res,'Invalid transport end date');if(endDate<new Date(doc.startDate))return bad(res,'End date cannot be before start date');
  doc.status='ended';doc.endDate=endDate;await doc.save();
  await audit(req,'END_TRANSPORT_ASSIGNMENT','TransportAssignment',doc._id);res.json(doc);
}

async function listMaintenance(req,res){
  const q={collegeId:cid(req)};if(req.query.vehicleId)q.vehicleId=req.query.vehicleId;
  res.json(await TransportMaintenance.find(q).populate('vehicleId','vehicleCode registrationNo make model').sort({serviceDate:-1}));
}
async function addMaintenance(req,res){
  const collegeId=cid(req),vehicle=await TransportVehicle.findOne({_id:req.body.vehicleId,collegeId});
  if(!vehicle)return bad(res,'Vehicle not found',404);
  const payload=cleanBody(req.body,['vehicleId','type','description','serviceDate','odometer','cost','vendor','nextDueDate','status']);
  const serviceDate=asDate(payload.serviceDate);if(!serviceDate)return bad(res,'Valid service date is required');payload.serviceDate=serviceDate;
  const nextDueDate=payload.nextDueDate?asDate(payload.nextDueDate):null;if(payload.nextDueDate&&!nextDueDate)return bad(res,'Invalid next due date');if(nextDueDate&&nextDueDate<serviceDate)return bad(res,'Next due date cannot be before service date');payload.nextDueDate=nextDueDate||undefined;
  if(payload.odometer!==undefined&&payload.odometer!==''){const odometer=Number(payload.odometer);if(!Number.isFinite(odometer)||odometer<0)return bad(res,'Odometer must be zero or greater');if(payload.status==='completed'&&odometer<Number(vehicle.odometer||0))return bad(res,`Completed maintenance odometer cannot be lower than the vehicle's current odometer (${vehicle.odometer||0})`);payload.odometer=odometer;}else delete payload.odometer;
  const cost=Number(payload.cost||0);if(!Number.isFinite(cost)||cost<0)return bad(res,'Maintenance cost must be zero or greater');payload.cost=cost;
  if(payload.status==='in_progress'){
    const occupied=await activePassengerCountForVehicle(collegeId,vehicle._id);
    if(occupied>0)return bad(res,`Maintenance cannot be started while ${occupied} active passenger(s) are assigned to this vehicle`,409);
  }
  const doc=await TransportMaintenance.create({...payload,collegeId,createdBy:req.user._id});
  if(payload.status==='scheduled'){
    if(!vehicle.nextServiceDueAt||serviceDate<vehicle.nextServiceDueAt)vehicle.nextServiceDueAt=serviceDate;
  }else if(payload.status==='in_progress'){
    vehicle.status='maintenance';vehicle.nextServiceDueAt=serviceDate;
  }else if(payload.status==='completed'){
    vehicle.lastServiceAt=serviceDate;if(nextDueDate)vehicle.nextServiceDueAt=nextDueDate;if(payload.odometer!=null)vehicle.odometer=Math.max(Number(vehicle.odometer||0),Number(payload.odometer));
    if(vehicle.status==='maintenance')vehicle.status='active';
  }
  await vehicle.save();await audit(req,'ADD_TRANSPORT_MAINTENANCE','TransportMaintenance',doc._id,{vehicleId:vehicle._id,status:payload.status});res.status(201).json(doc);
}

async function dashboard(req,res){
  const collegeId=cid(req),settings=await settingsFor(collegeId),now=new Date();
  const remind=new Date(Date.now()+Number(settings.documentExpiryReminderDays||30)*86400000);
  const maintenanceDate=new Date(Date.now()+Number(settings.maintenanceReminderDays||30)*86400000);
  const [totalVehicles,activeVehicles,activeRoutes,activeAssignments,maintenanceDue,docsExpiring,docsExpired,serviceVehicleIds]=await Promise.all([
    TransportVehicle.countDocuments({collegeId}),TransportVehicle.countDocuments({collegeId,status:'active'}),TransportRoute.countDocuments({collegeId,isActive:true}),TransportAssignment.countDocuments({collegeId,status:'active'}),TransportVehicle.countDocuments({collegeId,status:{$ne:'inactive'},nextServiceDueAt:{$lte:maintenanceDate}}),TransportVehicle.countDocuments({collegeId,status:{$ne:'inactive'},$or:[{insuranceExpiry:{$gte:now,$lte:remind}},{fitnessExpiry:{$gte:now,$lte:remind}},{permitExpiry:{$gte:now,$lte:remind}}]}),TransportVehicle.countDocuments({collegeId,status:{$ne:'inactive'},$or:[{insuranceExpiry:{$lt:now}},{fitnessExpiry:{$lt:now}},{permitExpiry:{$lt:now}}]}),TransportRoute.find({collegeId,isActive:true,vehicleId:{$ne:null}}).distinct('vehicleId')
  ]);
  const serviceVehicles=serviceVehicleIds.length?await TransportVehicle.find({collegeId,_id:{$in:serviceVehicleIds},status:'active'}).select('seatingCapacity').lean():[];
  const serviceCapacity=serviceVehicles.reduce((s,v)=>s+Number(v.seatingCapacity||0),0);
  res.json({totalVehicles,activeVehicles,activeRoutes,activeAssignments,serviceCapacity,availableSeats:Math.max(0,serviceCapacity-activeAssignments),maintenanceDue,documentsExpiring:docsExpiring,documentsExpired:docsExpired});
}

async function report(req,res){
  const collegeId=cid(req);
  const [routes,vehicles,assignments,maintenance]=await Promise.all([listRoutesData(collegeId),listVehiclesData(collegeId),TransportAssignment.find({collegeId,status:'active'}).populate('studentId','name rollNo admissionNo').populate('routeId','name code stops'),TransportMaintenance.find({collegeId}).populate('vehicleId','vehicleCode registrationNo').sort({serviceDate:-1}).limit(250).lean()]);
  const serviceVehicleIds=[...new Set(routes.filter(r=>r.isActive&&r.vehicleId?.status==='active').map(r=>String(r.vehicleId._id)))];
  const serviceVehicles=vehicles.filter(v=>serviceVehicleIds.includes(String(v._id)));
  const summary={activeStudents:assignments.length,activeRoutes:routes.filter(r=>r.isActive).length,serviceCapacity:serviceVehicles.reduce((s,v)=>s+Number(v.seatingCapacity||0),0),monthlyAssignedFees:assignments.reduce((s,a)=>s+Number(a.monthlyFee||0),0),maintenanceCost:maintenance.filter(m=>m.status==='completed').reduce((s,m)=>s+Number(m.cost||0),0)};
  res.json({routes,vehicles,assignments,maintenance,summary});
}
async function activePassengerCountsByVehicle(collegeId){
  const rows=await TransportAssignment.aggregate([
    {$match:{collegeId,status:'active'}},
    {$lookup:{from:TransportRoute.collection.name,localField:'routeId',foreignField:'_id',as:'route'}},
    {$unwind:'$route'},
    {$match:{'route.collegeId':collegeId,'route.vehicleId':{$ne:null}}},
    {$group:{_id:'$route.vehicleId',count:{$sum:1}}}
  ]);
  return new Map(rows.map(x=>[String(x._id),x.count]));
}
async function listRoutesData(collegeId){
  const [docs,counts,vehicleMap]=await Promise.all([
    TransportRoute.find({collegeId}).populate('vehicleId','vehicleCode registrationNo seatingCapacity status').lean(),
    TransportAssignment.aggregate([{$match:{collegeId,status:'active'}},{$group:{_id:'$routeId',count:{$sum:1}}}]),
    activePassengerCountsByVehicle(collegeId)
  ]);
  const map=new Map(counts.map(x=>[String(x._id),x.count]));
  return docs.map(r=>{const occupiedSeats=r.vehicleId?vehicleMap.get(String(r.vehicleId._id))||0:0;return {...r,activePassengers:map.get(String(r._id))||0,vehicleOccupiedSeats:occupiedSeats,vehicleAvailableSeats:r.vehicleId?Math.max(0,Number(r.vehicleId.seatingCapacity||0)-occupiedSeats):0};});
}
async function listVehiclesData(collegeId){
  const [docs,vehicleMap]=await Promise.all([TransportVehicle.find({collegeId}).lean(),activePassengerCountsByVehicle(collegeId)]);
  return docs.map(v=>{const occupied=vehicleMap.get(String(v._id))||0;return {...v,occupiedSeats:occupied,availableSeats:Math.max(0,Number(v.seatingCapacity||0)-occupied)}});
}

async function getSettings(req,res){res.json(await settingsFor(cid(req)))}
async function saveSettings(req,res){
  const payload=cleanBody(req.body,['enforceCapacity','allowRouteChange','allowFeeOverride','maintenanceReminderDays','documentExpiryReminderDays']);
  const doc=await TransportSettings.findOneAndUpdate({collegeId:cid(req)},{$set:payload,$setOnInsert:{collegeId:cid(req)}},{new:true,upsert:true,runValidators:true});
  await audit(req,'UPDATE_TRANSPORT_SETTINGS','TransportSettings',doc._id);res.json(doc);
}

async function studentMyTransport(req,res){
  if(!req.user?.linkedStudentId)return bad(res,'Student account required',403);
  const doc=await TransportAssignment.findOne({collegeId:cid(req),studentId:req.user.linkedStudentId,status:'active'}).populate({path:'routeId',populate:{path:'vehicleId',select:'vehicleCode registrationNo vehicleType make model driverEmployeeId'}}).populate('academicSessionId','name');
  res.json(doc||null);
}

module.exports={lookups,listVehicles,createVehicle,updateVehicle,listRoutes,createRoute,updateRoute,listAssignments,assignStudent,endAssignment,listMaintenance,addMaintenance,dashboard,report,getSettings,saveSettings,studentMyTransport};
