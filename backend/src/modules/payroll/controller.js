const { collegeIdFromRequest: cid, sendError: bad } = require('../../utils/request');
const Employee=require('../../models/Employee');
const SalaryStructure=require('../../models/SalaryStructure');
const EmployeeLeave=require('../../models/EmployeeLeave');
const EmployeeLoan=require('../../models/EmployeeLoan');
const PayrollRecord=require('../../models/PayrollRecord');
const PayrollAdjustment=require('../../models/PayrollAdjustment');
const PayrollPayment=require('../../models/PayrollPayment');
const PayrollSettings=require('../../models/PayrollSettings');
const StaffAttendance=require('../../models/StaffAttendance');
const College=require('../../models/College');
const {audit}=require('../../services/auditService');
const financeService=require('../../services/financeService');

function has(user,p){return user?.systemRole==='platform_owner'||(user?.effectivePermissions||[]).includes('*')||(user?.effectivePermissions||[]).includes(p)}
function employeeScope(req,q={}){if(req.user?.linkedEmployeeId&&!has(req.user,'VIEW_PAYROLL_REPORTS'))q.employeeId=req.user.linkedEmployeeId;return q;}
function computeComponent(c,basic){return c.calculation==='percentage_of_basic'?Number((basic*(Number(c.value)||0)/100).toFixed(2)):Number(c.value||0)}
function monthBounds(year,month){return {start:new Date(year,month-1,1),end:new Date(year,month,0,23,59,59,999)}}
function asDate(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d}
async function payrollSettings(collegeId){return (await PayrollSettings.findOne({collegeId}).lean())||{enabled:true,salaryCalculationDay:30,attendanceDeductionEnabled:false,perDayDeductionMethod:'30_days',allowPartialPayment:true,requireApproval:true,payslipFooter:''}}
async function requirePayrollEnabled(collegeId,res){const settings=await payrollSettings(collegeId);if(settings.enabled===false){bad(res,'Payroll is disabled in Payroll Settings',409);return null}return settings}
function dayKey(value){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function calendarDaysInclusive(a,b){const start=new Date(a.getFullYear(),a.getMonth(),a.getDate()),end=new Date(b.getFullYear(),b.getMonth(),b.getDate());return Math.max(0,Math.floor((end-start)/86400000)+1)}
function leaveOverlapDays(leave,monthStart,monthEnd){
  const leaveStart=new Date(leave.startDate),leaveEnd=new Date(leave.endDate);
  const overlapStart=leaveStart>monthStart?leaveStart:monthStart,overlapEnd=leaveEnd<monthEnd?leaveEnd:monthEnd;
  if(overlapEnd<overlapStart)return 0;
  const totalSpan=Math.max(1,calendarDaysInclusive(leaveStart,leaveEnd));
  const overlapSpan=calendarDaysInclusive(overlapStart,overlapEnd);
  return Number((Math.min(Number(leave.days||0),Number(leave.days||0)*(overlapSpan/totalSpan))).toFixed(2));
}
function leaveCoveredDateKeys(leaves,monthStart,monthEnd){
  const keys=new Set();
  for(const leave of leaves){
    let d=new Date(Math.max(new Date(leave.startDate).getTime(),monthStart.getTime()));
    const last=new Date(Math.min(new Date(leave.endDate).getTime(),monthEnd.getTime()));
    d=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    const end=new Date(last.getFullYear(),last.getMonth(),last.getDate());
    while(d<=end){keys.add(dayKey(d));d.setDate(d.getDate()+1);}
  }
  return keys;
}
async function scheduledWorkingDays(collegeId,start,end){
  const college=await College.findOne({_id:collegeId}).select('timetableSettings.workingDays').lean();
  const names=Array.isArray(college?.timetableSettings?.workingDays)&&college.timetableSettings.workingDays.length
    ?college.timetableSettings.workingDays
    :['monday','tuesday','wednesday','thursday','friday','saturday'];
  const allowed=new Set(names.map(x=>String(x).toLowerCase()));
  const dayNames=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  let count=0,d=new Date(start.getFullYear(),start.getMonth(),start.getDate()),last=new Date(end.getFullYear(),end.getMonth(),end.getDate());
  while(d<=last){if(allowed.has(dayNames[d.getDay()]))count++;d.setDate(d.getDate()+1);}
  return Math.max(1,count);
}

async function employeeOptions(req,res){
  const q={collegeId:cid(req),isActive:true};
  if(req.user?.linkedEmployeeId&&!has(req.user,'VIEW_PAYROLL_REPORTS'))q._id=req.user.linkedEmployeeId;
  const rows=await Employee.find(q)
    .populate('designationId','name').populate('branchId','name code')
    .select('employeeNo employeeCode name category designationId branchId basicSalary dateOfJoining')
    .sort({name:1}).lean();
  res.json(rows);
}

async function listSalaryStructures(req,res){
  res.json(await SalaryStructure.find(employeeScope(req,{collegeId:cid(req)}))
    .populate({path:'employeeId',select:'name employeeNo employeeCode category branchId designationId',populate:[{path:'branchId',select:'name code'},{path:'designationId',select:'name'}]})
    .sort({effectiveFrom:-1}));
}

async function createSalaryStructure(req,res){
  const collegeId=cid(req);if(!await requirePayrollEnabled(collegeId,res))return;
  const employee=await Employee.findOne({_id:req.body.employeeId,collegeId,isActive:true});
  if(!employee)return bad(res,'Invalid employee');
  const basicSalary=Number(req.body.basicSalary);
  if(!Number.isFinite(basicSalary)||basicSalary<0)return bad(res,'Basic salary must be zero or greater');
  const effectiveFrom=req.body.effectiveFrom?asDate(req.body.effectiveFrom):new Date();
  if(!effectiveFrom)return bad(res,'Invalid salary effective date');
  const active=await SalaryStructure.findOne({collegeId,employeeId:employee._id,isActive:true}).sort({effectiveFrom:-1});
  if(active&&effectiveFrom<=active.effectiveFrom)return bad(res,'New salary structure effective date must be after the current active structure date',409);
  const components=[];
  for(const x of req.body.components||[]){
    const name=String(x?.name||'').trim();if(!name)continue;
    const value=Number(x?.value);if(!Number.isFinite(value)||value<0)return bad(res,`Invalid value for salary component "${name}"`);
    components.push({name,type:x.type==='deduction'?'deduction':'allowance',calculation:x.calculation==='percentage_of_basic'?'percentage_of_basic':'fixed',value});
  }
  if(active){active.isActive=false;active.effectiveTo=new Date(effectiveFrom.getTime()-1);await active.save();}
  const doc=await SalaryStructure.create({collegeId,employeeId:employee._id,effectiveFrom,basicSalary,components,isActive:true});
  await audit(req,'CREATE_SALARY_STRUCTURE','SalaryStructure',doc._id,{employeeId:employee._id});
  res.status(201).json(doc);
}

async function listAdjustments(req,res){
  const q=employeeScope(req,{collegeId:cid(req)});
  if(req.query.year)q.year=Number(req.query.year);if(req.query.month)q.month=Number(req.query.month);
  res.json(await PayrollAdjustment.find(q).populate('employeeId','name employeeNo employeeCode').sort({createdAt:-1}));
}
async function createAdjustment(req,res){
  const collegeId=cid(req);if(!await requirePayrollEnabled(collegeId,res))return;
  const year=Number(req.body.year),month=Number(req.body.month),amount=Number(req.body.amount);
  if(!year||month<1||month>12)return bad(res,'Valid payroll month is required');
  if(!(amount>0))return bad(res,'Amount must be greater than zero');
  if(!String(req.body.reason||'').trim())return bad(res,'Reason is required');
  const employee=await Employee.findOne({_id:req.body.employeeId,collegeId,isActive:true});if(!employee)return bad(res,'Invalid employee');
  const locked=await PayrollRecord.findOne({collegeId,employeeId:employee._id,year,month,status:{$in:['approved','posted','partially_paid','paid']}});
  if(locked)return bad(res,'Payroll is already posted for this employee/month. Add the correction to a later payroll period.');
  const doc=await PayrollAdjustment.create({collegeId,employeeId:employee._id,year,month,type:req.body.type||'other',amount,reason:String(req.body.reason).trim(),createdBy:req.user._id});
  await audit(req,'CREATE_PAYROLL_ADJUSTMENT','PayrollAdjustment',doc._id,{employeeId:employee._id,year,month});
  res.status(201).json(doc);
}
async function deleteAdjustment(req,res){
  const collegeId=cid(req);if(!await requirePayrollEnabled(collegeId,res))return;
  const doc=await PayrollAdjustment.findOne({_id:req.params.id,collegeId});if(!doc)return bad(res,'Adjustment not found',404);
  const locked=await PayrollRecord.findOne({collegeId,employeeId:doc.employeeId,year:doc.year,month:doc.month,status:{$in:['approved','posted','partially_paid','paid']}});
  if(locked)return bad(res,'Posted payroll adjustments cannot be removed');
  await doc.deleteOne();await audit(req,'DELETE_PAYROLL_ADJUSTMENT','PayrollAdjustment',doc._id);res.json({message:'Adjustment removed'});
}

async function generatePayroll(req,res){
  const collegeId=cid(req),year=Number(req.body.year),month=Number(req.body.month);
  if(!year||year<2000||year>2100||month<1||month>12)return bad(res,'Valid year and month are required');
  const settings=await requirePayrollEnabled(collegeId,res);if(!settings)return;
  const employeeQuery={collegeId,isActive:true};if(req.body.employeeId)employeeQuery._id=req.body.employeeId;if(req.body.branchId)employeeQuery.branchId=req.body.branchId;if(req.body.category)employeeQuery.category=req.body.category;
  const employees=await Employee.find(employeeQuery);
  const {start,end}=monthBounds(year,month),results=[];let skippedLocked=0,skippedNoStructure=0,skippedNotJoined=0;
  const employeeIds=employees.map(e=>e._id);
  const [existingRows,structureRows,adjustmentRows,leaveRows,absenceRows,loanRows,monthWorkingDays]=await Promise.all([
    PayrollRecord.find({collegeId,employeeId:{$in:employeeIds},year,month}).lean(),
    SalaryStructure.find({collegeId,employeeId:{$in:employeeIds},effectiveFrom:{$lte:end},$or:[{effectiveTo:null},{effectiveTo:{$gte:start}}]}).sort({effectiveFrom:-1}).lean(),
    PayrollAdjustment.find({collegeId,employeeId:{$in:employeeIds},year,month}).lean(),
    EmployeeLeave.find({collegeId,employeeId:{$in:employeeIds},status:'approved',leaveType:'unpaid',startDate:{$lte:end},endDate:{$gte:start}}).lean(),
    settings.attendanceDeductionEnabled?StaffAttendance.find({collegeId,employeeId:{$in:employeeIds},attendanceDate:{$gte:start,$lte:end},status:'absent'}).select('employeeId attendanceDate').lean():Promise.resolve([]),
    EmployeeLoan.find({collegeId,employeeId:{$in:employeeIds},status:'active',outstandingAmount:{$gt:0}}).sort({approvedAt:1,createdAt:1}).lean(),
    scheduledWorkingDays(collegeId,start,end)
  ]);
  const key=v=>String(v);
  const existingByEmployee=new Map(existingRows.map(row=>[key(row.employeeId),row]));
  const structureByEmployee=new Map();for(const row of structureRows){const k=key(row.employeeId);if(!structureByEmployee.has(k))structureByEmployee.set(k,row);}
  const groupByEmployee=rows=>{const map=new Map();for(const row of rows){const k=key(row.employeeId);if(!map.has(k))map.set(k,[]);map.get(k).push(row);}return map;};
  const adjustmentsByEmployee=groupByEmployee(adjustmentRows),leavesByEmployee=groupByEmployee(leaveRows),absencesByEmployee=groupByEmployee(absenceRows),loansByEmployee=groupByEmployee(loanRows);
  for(const employee of employees){
    const employeeKey=key(employee._id);
    if(employee.dateOfJoining&&new Date(employee.dateOfJoining)>end){skippedNotJoined++;continue;}
    const existing=existingByEmployee.get(employeeKey);
    if(existing&&['approved','posted','partially_paid','paid'].includes(existing.status)){skippedLocked++;continue;}
    const structure=structureByEmployee.get(employeeKey);
    if(!structure){skippedNoStructure++;continue;}
    const basic=Number(structure.basicSalary||0),allowances=[],deductions=[];
    for(const c of structure.components||[]){const item={name:c.name,amount:computeComponent(c,basic),source:'salary_structure'};(c.type==='allowance'?allowances:deductions).push(item);}
    const adjustments=adjustmentsByEmployee.get(employeeKey)||[];
    for(const a of adjustments){const item={name:`${String(a.type).replaceAll('_',' ')} - ${a.reason}`,amount:Number(a.amount||0),source:'manual'};(['bonus','allowance'].includes(a.type)?allowances:deductions).push(item);}
    const unpaidLeaves=leavesByEmployee.get(employeeKey)||[];
    const unpaidDays=Number(unpaidLeaves.reduce((sum,leave)=>sum+leaveOverlapDays(leave,start,end),0).toFixed(2));
    const calendarDivisor=30;
    const workingDays=settings.perDayDeductionMethod==='working_days'?monthWorkingDays:calendarDivisor;
    const perDayRate=basic/workingDays;
    if(unpaidDays>0)deductions.push({name:'Unpaid Leave',amount:Number((perDayRate*unpaidDays).toFixed(2)),source:'leave'});

    let attendanceAbsentDays=0;
    if(settings.attendanceDeductionEnabled){
      const unpaidLeaveDateKeys=leaveCoveredDateKeys(unpaidLeaves,start,end);
      const uniqueAbsences=new Set();
      for(const row of absencesByEmployee.get(employeeKey)||[]){
        const dateKey=dayKey(row.attendanceDate);
        if(!unpaidLeaveDateKeys.has(dateKey))uniqueAbsences.add(dateKey);
      }
      attendanceAbsentDays=uniqueAbsences.size;
      if(attendanceAbsentDays>0)deductions.push({name:'Attendance Absence',amount:Number((perDayRate*attendanceAbsentDays).toFixed(2)),source:'attendance'});
    }

    const gross=Number((basic+allowances.reduce((sum,item)=>sum+item.amount,0)).toFixed(2));
    const activeLoans=loansByEmployee.get(employeeKey)||[];
    let remainingForLoanRecovery=Math.max(0,Number((gross-deductions.reduce((sum,item)=>sum+Number(item.amount||0),0)).toFixed(2)));
    const periodKey=payrollMonthKey(year,month);
    for(const loan of activeLoans){
      if(normalizeStartMonth(loan.startMonth)&&loan.startMonth>periodKey)continue;
      const amount=Math.min(Number(loan.monthlyDeduction||0),Number(loan.outstandingAmount||0),remainingForLoanRecovery);
      if(amount>0){
        deductions.push({name:`${loan.type==='loan'?'Loan':'Advance'} Recovery`,amount:Number(amount.toFixed(2)),source:'loan',sourceRefId:loan._id});
        remainingForLoanRecovery=Math.max(0,Number((remainingForLoanRecovery-amount).toFixed(2)));
      }
      if(remainingForLoanRecovery<=0)break;
    }
    const totalDed=Number(deductions.reduce((sum,item)=>sum+item.amount,0).toFixed(2));const net=Math.max(0,Number((gross-totalDed).toFixed(2)));
    const autoPost=settings.requireApproval===false;
    const payroll=await PayrollRecord.findOneAndUpdate({collegeId,employeeId:employee._id,year,month},{$set:{salaryStructureId:structure._id,basicSalary:basic,allowances,deductions,grossSalary:gross,totalDeductions:totalDed,netSalary:net,balanceAmount:net,paidAmount:0,workingDays,paidDays:Math.max(0,Number((workingDays-unpaidDays-attendanceAbsentDays).toFixed(2))),unpaidLeaveDays:unpaidDays,status:autoPost?'posted':'generated',generatedBy:req.user._id,approvedBy:autoPost?req.user._id:null,approvedAt:autoPost?new Date():null}},{new:true,upsert:true,setDefaultsOnInsert:true});
    results.push(payroll);
  }
  await audit(req,'GENERATE_PAYROLL','PayrollRecord',null,{year,month,count:results.length,skippedLocked,skippedNoStructure,skippedNotJoined});
  res.json({message:'Payroll generated',count:results.length,skippedLocked,skippedNoStructure,skippedNotJoined,records:results});
}

function normalizeStartMonth(value){
  const s=String(value||'').trim();
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(s))return null;
  return s;
}
function payrollMonthKey(year,month){return `${year}-${String(month).padStart(2,'0')}`}
async function listLoans(req,res){
  const q=employeeScope(req,{collegeId:cid(req)});
  if(req.query.status)q.status=req.query.status;
  if(req.query.type)q.type=req.query.type;
  res.json(await EmployeeLoan.find(q).populate('employeeId','name employeeNo employeeCode').populate('approvedBy','name email').sort({createdAt:-1}));
}
async function createLoan(req,res){
  const collegeId=cid(req);if(!await requirePayrollEnabled(collegeId,res))return;
  const employee=await Employee.findOne({_id:req.body.employeeId,collegeId,isActive:true});if(!employee)return bad(res,'Invalid employee');
  const type=req.body.type==='loan'?'loan':'advance';
  const principalAmount=Number(req.body.principalAmount),monthlyDeduction=Number(req.body.monthlyDeduction);
  if(!Number.isFinite(principalAmount)||principalAmount<=0)return bad(res,'Requested amount must be greater than zero');
  if(!Number.isFinite(monthlyDeduction)||monthlyDeduction<=0)return bad(res,'Monthly recovery must be greater than zero');
  if(monthlyDeduction>principalAmount)return bad(res,'Monthly recovery cannot exceed the requested amount');
  const startMonth=normalizeStartMonth(req.body.startMonth);if(!startMonth)return bad(res,'Valid recovery start month is required');
  const duplicate=await EmployeeLoan.findOne({collegeId,employeeId:employee._id,type,status:{$in:['pending','approved','active']},startMonth});
  if(duplicate)return bad(res,`A ${type} request already exists for this employee and recovery start month`,409);
  const doc=await EmployeeLoan.create({collegeId,employeeId:employee._id,type,principalAmount,approvedAmount:0,outstandingAmount:0,monthlyDeduction,startMonth,reason:String(req.body.reason||'').trim(),status:'pending'});
  await audit(req,'CREATE_EMPLOYEE_LOAN','EmployeeLoan',doc._id,{employeeId:employee._id,type,principalAmount,startMonth});
  res.status(201).json(doc);
}
async function approveLoan(req,res){
  const collegeId=cid(req);if(!await requirePayrollEnabled(collegeId,res))return;
  const doc=await EmployeeLoan.findOne({_id:req.params.id,collegeId});if(!doc)return bad(res,'Loan / advance request not found',404);
  if(doc.status!=='pending')return bad(res,'Only pending requests can be approved',409);
  const approvedAmount=req.body.approvedAmount===undefined?Number(doc.principalAmount):Number(req.body.approvedAmount);
  const monthlyDeduction=req.body.monthlyDeduction===undefined?Number(doc.monthlyDeduction):Number(req.body.monthlyDeduction);
  if(!Number.isFinite(approvedAmount)||approvedAmount<=0||approvedAmount>Number(doc.principalAmount))return bad(res,'Approved amount must be greater than zero and cannot exceed the requested amount');
  if(!Number.isFinite(monthlyDeduction)||monthlyDeduction<=0||monthlyDeduction>approvedAmount)return bad(res,'Monthly recovery must be greater than zero and cannot exceed the approved amount');
  const startMonth=normalizeStartMonth(req.body.startMonth||doc.startMonth);if(!startMonth)return bad(res,'Valid recovery start month is required');
  doc.approvedAmount=approvedAmount;doc.outstandingAmount=approvedAmount;doc.monthlyDeduction=monthlyDeduction;doc.startMonth=startMonth;doc.status='active';doc.approvedBy=req.user._id;doc.approvedAt=new Date();await doc.save();
  await audit(req,'APPROVE_EMPLOYEE_LOAN','EmployeeLoan',doc._id,{approvedAmount,monthlyDeduction,startMonth});
  res.json(doc);
}
async function rejectLoan(req,res){
  const collegeId=cid(req);if(!await requirePayrollEnabled(collegeId,res))return;
  const doc=await EmployeeLoan.findOne({_id:req.params.id,collegeId});if(!doc)return bad(res,'Loan / advance request not found',404);
  if(doc.status!=='pending')return bad(res,'Only pending requests can be rejected',409);
  doc.status='rejected';await doc.save();await audit(req,'REJECT_EMPLOYEE_LOAN','EmployeeLoan',doc._id,{reason:String(req.body?.reason||'').trim()});res.json(doc);
}
async function cancelLoan(req,res){
  const collegeId=cid(req);if(!await requirePayrollEnabled(collegeId,res))return;
  const doc=await EmployeeLoan.findOne({_id:req.params.id,collegeId});if(!doc)return bad(res,'Loan / advance not found',404);
  if(!['pending','approved','active'].includes(doc.status))return bad(res,'This loan / advance cannot be cancelled',409);
  if((doc.recoveryHistory||[]).length)return bad(res,'A loan / advance with recorded payroll recovery cannot be cancelled. Complete or adjust it through payroll.',409);
  doc.status='cancelled';doc.outstandingAmount=0;await doc.save();await audit(req,'CANCEL_EMPLOYEE_LOAN','EmployeeLoan',doc._id);res.json(doc);
}

async function listPayroll(req,res){
  const q=employeeScope(req,{collegeId:cid(req)});if(req.query.year)q.year=Number(req.query.year);if(req.query.month)q.month=Number(req.query.month);if(req.query.status)q.status=req.query.status;
  const rows=await PayrollRecord.find(q).populate({path:'employeeId',select:'name employeeNo employeeCode category branchId designationId',populate:[{path:'branchId',select:'name code'},{path:'designationId',select:'name'}]}).sort({year:-1,month:-1});res.json(rows);
}
async function approvePayroll(req,res){
  const collegeId=cid(req);if(!await requirePayrollEnabled(collegeId,res))return;
  const doc=await PayrollRecord.findOne({_id:req.params.id,collegeId});if(!doc)return bad(res,'Payroll record not found',404);if(doc.status!=='generated')return bad(res,'Only generated payroll can be posted');
  doc.status='posted';doc.approvedBy=req.user._id;doc.approvedAt=new Date();doc.balanceAmount=Math.max(0,Number((doc.netSalary-Number(doc.paidAmount||0)).toFixed(2)));await doc.save();await audit(req,'POST_PAYROLL','PayrollRecord',doc._id);res.json(doc);
}

async function listPayments(req,res){
  const q=employeeScope(req,{collegeId:cid(req)});if(req.query.payrollRecordId)q.payrollRecordId=req.query.payrollRecordId;if(req.query.employeeId&&!q.employeeId)q.employeeId=req.query.employeeId;
  res.json(await PayrollPayment.find(q).populate('employeeId','name employeeNo employeeCode').populate('payrollRecordId','year month netSalary status').sort({paymentDate:-1,createdAt:-1}));
}
async function createPayment(req,res){
  const collegeId=cid(req),settings=await requirePayrollEnabled(collegeId,res);if(!settings)return;
  const doc=await PayrollRecord.findOne({_id:req.body.payrollRecordId,collegeId});if(!doc)return bad(res,'Payroll record not found',404);
  if(!['approved','posted','partially_paid'].includes(doc.status))return bad(res,'Payroll must be posted before payment');
  const amount=Number(req.body.amount);const balance=Math.max(0,Number(doc.netSalary||0)-Number(doc.paidAmount||0));
  if(!(amount>0))return bad(res,'Payment amount must be greater than zero');if(amount>balance)return bad(res,'Payment amount cannot exceed outstanding salary');
  if(settings?.allowPartialPayment===false&&amount<balance)return bad(res,'Partial salary payment is disabled in Payroll Settings');
  const paymentDate=req.body.paymentDate?asDate(req.body.paymentDate):new Date();if(!paymentDate)return bad(res,'Invalid salary payment date');
  const payment=await PayrollPayment.create({collegeId,payrollRecordId:doc._id,employeeId:doc.employeeId,amount,paymentDate,paymentMethod:req.body.paymentMethod||'bank',referenceNo:req.body.referenceNo||'',remarks:req.body.remarks||'',financeAccountId:req.body.financeAccountId||null,createdBy:req.user._id});
  doc.paidAmount=Number((Number(doc.paidAmount||0)+amount).toFixed(2));doc.balanceAmount=Math.max(0,Number((doc.netSalary-doc.paidAmount).toFixed(2)));doc.status=doc.balanceAmount<=0?'paid':'partially_paid';doc.paidAt=doc.status==='paid'?paymentDate:doc.paidAt;doc.paymentMethod=req.body.paymentMethod||doc.paymentMethod;doc.paymentReference=req.body.referenceNo||doc.paymentReference;await doc.save();
  const financePaymentMethod=String(req.body.paymentMethod||'bank').toLowerCase()==='cash'?'cash':'bank_transfer';
  await financeService.postSourceTransaction({collegeId,type:'expense',amount,transactionDate:paymentDate,paymentMethod:financePaymentMethod,accountId:req.body.financeAccountId,headCode:'SALARIES',sourceModule:'payroll',sourceDocumentType:'PayrollPayment',sourceDocumentId:payment._id,sourceReference:`${doc.month}/${doc.year}`,description:`Salary payment ${doc.month}/${doc.year}`,userId:req.user._id});
  if(doc.status==='paid'){
    const loanDeductions=(doc.deductions||[]).filter(x=>x.source==='loan'&&x.sourceRefId&&Number(x.amount||0)>0);
    for(const loanDed of loanDeductions){
      const loan=await EmployeeLoan.findOne({_id:loanDed.sourceRefId,collegeId,employeeId:doc.employeeId});
      if(!loan)continue;
      const alreadyRecovered=(loan.recoveryHistory||[]).some(x=>String(x.payrollRecordId)===String(doc._id));
      if(alreadyRecovered)continue;
      const recoverAmount=Math.min(Number(loanDed.amount||0),Number(loan.outstandingAmount||0));
      if(recoverAmount<=0)continue;
      loan.outstandingAmount=Math.max(0,Number((Number(loan.outstandingAmount||0)-recoverAmount).toFixed(2)));
      loan.recoveryHistory.push({payrollRecordId:doc._id,year:doc.year,month:doc.month,amount:recoverAmount,recoveredAt:paymentDate});
      if(loan.outstandingAmount<=0)loan.status='completed';
      await loan.save();
    }
  }
  await audit(req,'PAY_SALARY','PayrollPayment',payment._id,{payrollRecordId:doc._id,amount});res.status(201).json({payment,payroll:doc});
}

async function payslip(req,res){
  const doc=await PayrollRecord.findOne({_id:req.params.id,collegeId:cid(req)}).populate({path:'employeeId',select:'name employeeNo employeeCode phone email designationId branchId',populate:[{path:'designationId',select:'name'},{path:'branchId',select:'name code'}]}).lean();if(!doc)return bad(res,'Payroll record not found',404);
  if(req.user?.linkedEmployeeId&&!has(req.user,'VIEW_PAYROLL_REPORTS')&&String(doc.employeeId?._id)!==String(req.user.linkedEmployeeId))return bad(res,'Access denied',403);
  doc.payments=await PayrollPayment.find({collegeId:cid(req),payrollRecordId:doc._id}).sort({paymentDate:1}).lean();doc.settings=await PayrollSettings.findOne({collegeId:cid(req)}).lean();res.json(doc);
}

async function dashboard(req,res){
  const collegeId=cid(req),year=Number(req.query.year||new Date().getFullYear()),month=Number(req.query.month||new Date().getMonth()+1);
  const employeeQuery={collegeId,isActive:true};if(req.user?.linkedEmployeeId&&!has(req.user,'VIEW_PAYROLL_REPORTS'))employeeQuery._id=req.user.linkedEmployeeId;else{if(req.query.branchId)employeeQuery.branchId=req.query.branchId;if(req.query.category)employeeQuery.category=req.query.category;}
  const employeeIds=(await Employee.find(employeeQuery).select('_id').lean()).map(x=>x._id);const rows=await PayrollRecord.find({collegeId,year,month,employeeId:{$in:employeeIds}}).lean();
  res.json({year,month,totalEmployees:employeeIds.length,employees:rows.length,gross:rows.reduce((s,x)=>s+Number(x.grossSalary||0),0),deductions:rows.reduce((s,x)=>s+Number(x.totalDeductions||0),0),net:rows.reduce((s,x)=>s+Number(x.netSalary||0),0),paid:rows.reduce((s,x)=>s+Number(x.paidAmount||0),0),unpaid:rows.reduce((s,x)=>s+Number((x.balanceAmount ?? x.netSalary) || 0),0),pendingPayroll:Math.max(0,employeeIds.length-rows.length)});
}

async function getSettings(req,res){res.json(await payrollSettings(cid(req)));}
async function saveSettings(req,res){
  const allowed=['enabled','salaryCalculationDay','attendanceDeductionEnabled','perDayDeductionMethod','allowPartialPayment','requireApproval','payslipFooter'];const $set={updatedBy:req.user._id};
  for(const k of allowed)if(req.body[k]!==undefined)$set[k]=req.body[k];
  if($set.salaryCalculationDay!==undefined){const day=Number($set.salaryCalculationDay);if(!Number.isInteger(day)||day<1||day>31)return bad(res,'Salary calculation day must be between 1 and 31');$set.salaryCalculationDay=day;}
  if($set.perDayDeductionMethod!==undefined&&!['30_days','working_days'].includes($set.perDayDeductionMethod))return bad(res,'Invalid per-day deduction method');
  if($set.payslipFooter!==undefined)$set.payslipFooter=String($set.payslipFooter||'').trim();
  const doc=await PayrollSettings.findOneAndUpdate({collegeId:cid(req)},{$set,$setOnInsert:{collegeId:cid(req)}},{new:true,upsert:true,runValidators:true});await audit(req,'UPDATE_PAYROLL_SETTINGS','PayrollSettings',doc._id);res.json(doc);
}

module.exports={employeeOptions,listSalaryStructures,createSalaryStructure,listAdjustments,createAdjustment,deleteAdjustment,listLoans,createLoan,approveLoan,rejectLoan,cancelLoan,generatePayroll,listPayroll,approvePayroll,listPayments,createPayment,payslip,dashboard,getSettings,saveSettings};
