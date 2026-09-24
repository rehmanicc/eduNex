const { collegeIdFromRequest: cid, sendError: bad } = require('../../utils/request');
const Student=require('../../models/Student');
const Employee=require('../../models/Employee');
const Event=require('../../models/Event');
const ISARecord=require('../../models/ISARecord');
const TransportVehicle=require('../../models/TransportVehicle');
const TransportRoute=require('../../models/TransportRoute');
const TransportAssignment=require('../../models/TransportAssignment');
const Hostel=require('../../models/Hostel');
const HostelRoom=require('../../models/HostelRoom');
const HostelAssignment=require('../../models/HostelAssignment');
const HostelComplaint=require('../../models/HostelComplaint');
const PayrollRecord=require('../../models/PayrollRecord');
const EmployeeLeave=require('../../models/EmployeeLeave');
const SavedReport=require('../../models/SavedReport');
const {audit}=require('../../services/auditService');

function num(x){return Number(x||0)}
function pct(a,b){return b?Number(((a/b)*100).toFixed(1)):0}

async function executiveDashboard(req,res){
  const collegeId=cid(req);
  const now=new Date(), y=now.getFullYear(), m=now.getMonth()+1;
  const [
    students,employees,events,openISA,
    vehicles,routes,transportStudents,
    hostels,rooms,hostelStudents,hostelComplaints,
    payroll,leavePending
  ]=await Promise.all([
    Student.countDocuments({collegeId,status:'active'}),
    Employee.countDocuments({collegeId,isActive:true}),
    Event.countDocuments({collegeId,status:'published',endAt:{$gte:now}}),
    ISARecord.countDocuments({collegeId,status:{$in:['open','in_progress']}}),
    TransportVehicle.countDocuments({collegeId,status:{$ne:'inactive'}}),
    TransportRoute.countDocuments({collegeId,isActive:true}),
    TransportAssignment.countDocuments({collegeId,status:'active'}),
    Hostel.countDocuments({collegeId,isActive:true}),
    HostelRoom.find({collegeId,status:'active'}).lean(),
    HostelAssignment.countDocuments({collegeId,status:'active'}),
    HostelComplaint.countDocuments({collegeId,status:{$in:['open','in_progress']}}),
    PayrollRecord.find({collegeId,year:y,month:m}).lean(),
    EmployeeLeave.countDocuments({collegeId,status:'pending'})
  ]);
  let totalBeds=0,availableBeds=0;
  rooms.forEach(r=>(r.beds||[]).forEach(b=>{totalBeds++;if(b.status==='available')availableBeds++;}));
  const payrollNet=payroll.reduce((s,x)=>s+num(x.netSalary),0);
  const payrollPaid=payroll.filter(x=>x.status==='paid').reduce((s,x)=>s+num(x.netSalary),0);
  res.json({
    generatedAt:now,
    people:{students,employees},
    academics:{upcomingPublishedEvents:events,openISARecords:openISA},
    transport:{vehicles,routes,students:transportStudents},
    hostel:{hostels,rooms:rooms.length,totalBeds,availableBeds,occupancyRate:pct(totalBeds-availableBeds,totalBeds),students:hostelStudents,openComplaints:hostelComplaints},
    hr:{pendingLeaveRequests:leavePending},
    payroll:{year:y,month:m,employees:payroll.length,net:payrollNet,paid:payrollPaid,pending:Math.max(0,payrollNet-payrollPaid)}
  });
}

async function moduleSummary(req,res){
  const collegeId=cid(req), module=req.params.module;
  if(module==='transport'){
    const [vehicles,routes,assignments]=await Promise.all([
      TransportVehicle.find({collegeId}).lean(),TransportRoute.find({collegeId}).lean(),
      TransportAssignment.find({collegeId,status:'active'}).lean()
    ]);
    return res.json({module,vehicles:vehicles.length,activeVehicles:vehicles.filter(x=>x.status==='active').length,routes:routes.length,activeRoutes:routes.filter(x=>x.isActive).length,activeAssignments:assignments.length});
  }
  if(module==='hostel'){
    const [hostels,rooms,assignments,complaints]=await Promise.all([
      Hostel.countDocuments({collegeId,isActive:true}),HostelRoom.find({collegeId,status:'active'}).lean(),
      HostelAssignment.countDocuments({collegeId,status:'active'}),HostelComplaint.countDocuments({collegeId,status:{$in:['open','in_progress']}})
    ]);
    let beds=0,available=0; rooms.forEach(r=>(r.beds||[]).forEach(b=>{beds++;if(b.status==='available')available++;}));
    return res.json({module,hostels,rooms:rooms.length,beds,available,occupied:beds-available,occupancyRate:pct(beds-available,beds),activeAssignments:assignments,openComplaints:complaints});
  }
  if(module==='payroll'){
    const year=Number(req.query.year||new Date().getFullYear()),month=Number(req.query.month||new Date().getMonth()+1);
    const rows=await PayrollRecord.find({collegeId,year,month}).lean();
    return res.json({module,year,month,employees:rows.length,gross:rows.reduce((s,x)=>s+num(x.grossSalary),0),deductions:rows.reduce((s,x)=>s+num(x.totalDeductions),0),net:rows.reduce((s,x)=>s+num(x.netSalary),0),paid:rows.filter(x=>x.status==='paid').reduce((s,x)=>s+num(x.netSalary),0)});
  }
  if(module==='events'){
    const rows=await Event.find({collegeId}).lean();
    return res.json({module,total:rows.length,draft:rows.filter(x=>x.status==='draft').length,published:rows.filter(x=>x.status==='published').length,completed:rows.filter(x=>x.status==='completed').length,cancelled:rows.filter(x=>x.status==='cancelled').length});
  }
  if(module==='isa'){
    const rows=await ISARecord.find({collegeId}).lean();
    const categories={}; rows.forEach(x=>categories[x.category]=(categories[x.category]||0)+1);
    return res.json({module,total:rows.length,open:rows.filter(x=>x.status==='open').length,inProgress:rows.filter(x=>x.status==='in_progress').length,resolved:rows.filter(x=>['resolved','closed'].includes(x.status)).length,categories});
  }
  return bad(res,'Unsupported analytics module',404);
}

async function saveReport(req,res){
  const doc=await SavedReport.create({...req.body,collegeId:cid(req),createdBy:req.user._id});
  await audit(req,'CREATE_SAVED_REPORT','SavedReport',doc._id,{module:doc.module,reportType:doc.reportType});
  res.status(201).json(doc);
}
async function listSavedReports(req,res){
  const collegeId=cid(req);
  res.json(await SavedReport.find({collegeId,$or:[{createdBy:req.user._id},{isShared:true}]}).sort({updatedAt:-1}));
}
async function deleteSavedReport(req,res){
  const doc=await SavedReport.findOneAndDelete({_id:req.params.id,collegeId:cid(req),createdBy:req.user._id});
  if(!doc)return bad(res,'Saved report not found or not owned by you',404);
  await audit(req,'DELETE_SAVED_REPORT','SavedReport',doc._id);
  res.json({message:'Saved report deleted'});
}
module.exports={executiveDashboard,moduleSummary,saveReport,listSavedReports,deleteSavedReport};
