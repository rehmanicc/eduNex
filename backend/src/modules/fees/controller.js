const FeePackage=require('../../models/FeePackage');
const FeePackageChange=require('../../models/FeePackageChange');
const StudentFeePlan=require('../../models/StudentFeePlan');
const FeePayment=require('../../models/FeePayment');
const AdmissionApplication=require('../../models/AdmissionApplication');
const Student=require('../../models/Student');
const Program=require('../../models/Program');
const AcademicSession=require('../../models/AcademicSession');
const College=require('../../models/College');
const FeeDefaultInstallment=require('../../models/FeeDefaultInstallment');
const HostelAssignment=require('../../models/HostelAssignment');
const TransportAssignment=require('../../models/TransportAssignment');
const {audit}=require('../../services/auditService');
const seq=require('../../services/sequenceService');
const financeService=require('../../services/financeService');
const pushNotifications=require('../../services/pushNotificationService');
const Notification=require('../../models/Notification');
const User=require('../../models/User');

const {ensureStudentUser}=require('../../services/accountProvisioningService');
const collegeIdOf=req=>req.collegeId||req.user.collegeId;

async function notifyVoucherGenerated(collegeId,admission,posting){
  const student=await Student.findOne({collegeId,admissionApplicationId:admission._id}).select('_id').lean();
  if(!student)return;
  const users=await User.find({collegeId,isActive:true,linkedStudentId:student._id}).select('_id').lean();
  const title='Fee Voucher Generated';
  const body=`Voucher ${posting.voucherNo||''} has been generated${posting.dueDate?` and is due on ${new Date(posting.dueDate).toLocaleDateString('en-GB')}`:''}.`;
  if(users.length)await Notification.insertMany(users.map(u=>({collegeId,userId:u._id,type:'voucher',title,message:body,entityType:'FeePosting',entityId:posting._id})),{ordered:false}).catch(()=>{});
  pushNotifications.sendToStudentIds(collegeId,[student._id],{title,body,data:{type:'voucher',postingId:String(posting._id),voucherNo:String(posting.voucherNo||'')}}).catch(err=>console.error('voucher_push_error',err.message));
}

const financeMethod=m=>({bank:'bank_transfer',cash:'cash',card:'card',online:'online',cheque:'cheque',other:'other'})[String(m||'cash').toLowerCase()]||'other';

async function resolveCollegeVoucherType(collegeId, requested) {
  const college = await College.findById(collegeId).select('feeVoucherMode').lean();
  const mode = college?.feeVoucherMode || 'bank_and_cash';
  const asked = String(requested || '').toLowerCase() === 'cash' ? 'cash' : 'bank';
  if (mode === 'cash_only') return 'cash';
  if (mode === 'bank_only') return 'bank';
  return asked;
}
async function resolveCollegePaymentMethod(collegeId, requested) {
  const college = await College.findById(collegeId).select('feeVoucherMode').lean();
  const mode = college?.feeVoucherMode || 'bank_and_cash';
  if (mode === 'cash_only') return 'cash';
  if (mode === 'bank_only') return 'bank';
  const asked = String(requested || 'cash').toLowerCase();
  if (!['cash','bank'].includes(asked)) throw Object.assign(new Error('Payment method must be Cash or Bank according to College Profile settings.'), { status: 400 });
  return asked;
}

const snapshot=row=>({feePackageId:row._id,name:row.name,programId:row.programId,academicSessionId:row.academicSessionId,feeHeads:(row.feeHeads||[]).map(h=>({name:h.name,code:h.code,amount:h.amount})),totalAmount:row.totalAmount,version:row.version});

async function recalc(plan){const payments=await FeePayment.find({studentFeePlanId:plan._id,isReversed:false});plan.totalPaid=payments.reduce((s,p)=>s+Number(p.amount||0),0);for(const i of plan.installments)i.paidAmount=0;for(const p of payments){if(!p.installmentId)continue;const i=plan.installments.id(p.installmentId);if(i)i.paidAmount+=Number(p.amount||0);}await plan.save();}

async function ensureRollNo(req,admission){
  if(admission.rollNo)return admission.rollNo;
  const collegeId=collegeIdOf(req);
  const { generateRollNo } = require('../../services/rollNumberService');
  const rollNo=await generateRollNo({
    collegeId,
    programId:admission.programId,
    academicSessionId:admission.academicSessionId,
    gender:admission.gender
  });
  admission.rollNo=rollNo;
  if (['pending_admission','fee_pending'].includes(String(admission.status || ''))) {
    admission.status='provisional';
  }
  await admission.save();
  let student=admission.studentId?await Student.findOne({_id:admission.studentId,collegeId}):null;
  if(!student){student=await Student.create({collegeId,admissionNo:admission.formNo,registrationNo:admission.formNo,rollNo,name:admission.studentName,fatherName:admission.fatherName,phone:admission.contactNo,email:admission.email||'',dateOfBirth:admission.dateOfBirth,gender:admission.gender,address:admission.address,photoUrl:admission.studentPhotoUrl,programId:admission.programId,academicSessionId:admission.academicSessionId,currentSemester:admission.periodNumber||1,currentPeriod:admission.periodNumber||1,admissionApplicationId:admission._id,admissionDate:new Date(),admissionStanding:admission.status==='confirmed'?'confirmed':'provisional',resultStatus:admission.resultStatus,status:'active'});admission.studentId=student._id;await admission.save();}
  await ensureStudentUser(student);
  // Once-only fees must survive promotion. After a Student exists, normalize the plan to a student-based lifecycle key.
  await StudentFeePlan.updateOne({collegeId,admissionApplicationId:admission._id},{ $set:{ enrollmentKey:`student:${student._id}` } });
  return rollNo;
}


function validAdmissionResult(row) {
  const obtained = Number(row?.obtainedMarks), total = Number(row?.totalMarks);
  return Number.isFinite(obtained) && Number.isFinite(total) && obtained >= 0 && total > 0 && obtained <= total;
}
function admissionRequiredLevel(program) {
  if (program?.academicType === 'college') return '10th';
  if (program?.academicType === 'university') return '12th';
  return null;
}
async function canAutoConfirmAdmission(collegeId, admission) {
  if (admission.eligible !== true) return false;
  if (admission.migrationRequired && !String(admission.migrationCertificateNo || '').trim()) return false;
  const program = await Program.findOne({ _id: admission.programId, collegeId }).select('academicType').lean();
  const requiredLevel = admissionRequiredLevel(program);
  if (!requiredLevel) return true;
  const result = (admission.previousResults || []).find(x => String(x.level || '').trim().toLowerCase() === requiredLevel.toLowerCase());
  return validAdmissionResult(result);
}

async function promoteAdmissionAfterPostedPayment(req, admission) {
  if (!admission) return false;
  const collegeId = collegeIdOf(req);
  const current = String(admission.status || '').trim().toLowerCase();
  if (['provisional', 'confirmed', 'rejected', 'cancelled'].includes(current)) return false;

  // A posted payment plus a Roll No is the financial trigger for Provisional Admission.
  // Remaining balance does NOT block promotion.
  const hasPostedPayment = await FeePayment.exists({
    collegeId,
    admissionApplicationId: admission._id,
    isReversed: { $ne: true }
  });
  if (!hasPostedPayment) return false;

  if (!admission.rollNo) {
    await ensureRollNo(req, admission);
  }

  if (!admission.rollNo) return false;

  if (String(admission.status || '').toLowerCase() !== 'provisional') {
    admission.status = 'provisional';
    await admission.save();
  }

  if (admission.studentId) {
    await Student.updateOne(
      { _id: admission.studentId, collegeId },
      { $set: { admissionStanding: 'provisional' } }
    );
  }

  // If the Admission Form already contains eligibility and the required final result,
  // confirmation is automatic after the first posted payment. Pending migration/result keeps Provisional.
  if (await canAutoConfirmAdmission(collegeId, admission)) {
    admission.status = 'confirmed';
    admission.resultStatus = 'verified';
    admission.confirmedAt = admission.confirmedAt || new Date();
    admission.confirmedBy = admission.confirmedBy || req.user._id;
    await admission.save();
    if (admission.studentId) {
      await Student.updateOne(
        { _id: admission.studentId, collegeId },
        { $set: { admissionStanding: 'confirmed', resultStatus: 'verified' } }
      );
    }
    await audit(req, 'AUTO_CONFIRM_ADMISSION', 'AdmissionApplication', admission._id, { rollNo: admission.rollNo });
  }
  return true;
}
exports.listPackages=async(req,res)=>{const q=req.tenantFilter();if(req.query.programId)q.programId=req.query.programId;if(req.query.academicSessionId)q.academicSessionId=req.query.academicSessionId;res.json(await FeePackage.find(q).populate('programId','name code').populate('academicSessionId','name').populate('lockedBy','name email').sort({createdAt:-1}));};
exports.createPackage=async(req,res)=>{const collegeId=collegeIdOf(req);const [program,session]=await Promise.all([Program.findOne({_id:req.body.programId,collegeId}),AcademicSession.findOne({_id:req.body.academicSessionId,collegeId})]);if(!program||!session)throw Object.assign(new Error('Invalid program or academic session'),{status:400});const row=await FeePackage.create({collegeId,name:req.body.name,programId:req.body.programId,academicSessionId:req.body.academicSessionId,feeHeads:req.body.feeHeads||[],version:1,isLocked:false,createdBy:req.user._id,updatedBy:req.user._id});await audit(req,'CREATE','FeePackage',row._id,{version:1});res.status(201).json(row);};
exports.updatePackage=async(req,res)=>{const row=await FeePackage.findOne(req.tenantFilter({_id:req.params.id}));if(!row)throw Object.assign(new Error('Fee package not found'),{status:404});if(row.isLocked)throw Object.assign(new Error('Fee package is locked and cannot be edited.'),{status:409});const reason=String(req.body.changeReason||'').trim();if(!reason)throw Object.assign(new Error('Change reason is required when editing a fee package.'),{status:400});const before=snapshot(row),fromVersion=row.version;if(req.body.name!==undefined)row.name=req.body.name;if(req.body.feeHeads!==undefined)row.feeHeads=req.body.feeHeads;row.version+=1;row.updatedBy=req.user._id;await row.save();const after=snapshot(row);await FeePackageChange.create({collegeId:row.collegeId,feePackageId:row._id,fromVersion,toVersion:row.version,before,after,reason,changedBy:req.user._id});await audit(req,'UPDATE_FEE_PACKAGE','FeePackage',row._id,{fromVersion,toVersion:row.version,reason});res.json(row);};
exports.deletePackage=async(req,res)=>{const row=await FeePackage.findOne(req.tenantFilter({_id:req.params.id}));if(!row)throw Object.assign(new Error('Fee package not found'),{status:404});if(row.isLocked)throw Object.assign(new Error('Fee package is locked and cannot be deleted.'),{status:409});if(await StudentFeePlan.exists({collegeId:row.collegeId,feePackageId:row._id}))throw Object.assign(new Error('Fee package is already assigned to students and cannot be deleted.'),{status:409});await row.deleteOne();await audit(req,'DELETE','FeePackage',row._id);res.json({success:true});};
exports.lockPackage=async(req,res)=>{const row=await FeePackage.findOne(req.tenantFilter({_id:req.params.id}));if(!row)throw Object.assign(new Error('Fee package not found'),{status:404});if(!row.isLocked){row.isLocked=true;row.lockedAt=new Date();row.lockedBy=req.user._id;row.lockReason=String(req.body.reason||'').trim()||'Admission session fee package locked';await row.save();await audit(req,'LOCK_FEE_PACKAGE','FeePackage',row._id,{reason:row.lockReason,version:row.version});}res.json(row);};
exports.packageHistory=async(req,res)=>res.json(await FeePackageChange.find(req.tenantFilter({feePackageId:req.params.id})).populate('changedBy','name email').sort({createdAt:-1}));

exports.assignPackage=async(req,res)=>{
  const collegeId=collegeIdOf(req),admission=await AdmissionApplication.findOne({_id:req.params.admissionId,collegeId});if(!admission)throw Object.assign(new Error('Admission record not found'),{status:404});if(!admission.formNo)throw Object.assign(new Error('Admission profile must be completed before fee assignment.'),{status:409});
  const feePackage=await FeePackage.findOne({_id:req.body.feePackageId,collegeId,isActive:true});if(!feePackage)throw Object.assign(new Error('Fee package not found'),{status:404});if(String(feePackage.programId)!==String(admission.programId)||String(feePackage.academicSessionId)!==String(admission.academicSessionId))throw Object.assign(new Error('Fee package must match the admission program and academic session.'),{status:400});
  const installments=Array.isArray(req.body.installments)&&req.body.installments.length?req.body.installments:[{title:'Full Fee',amount:feePackage.totalAmount,sequence:1}];
  let plan=await StudentFeePlan.findOne({collegeId,admissionApplicationId:admission._id});
  if(!plan){plan=await StudentFeePlan.create({collegeId,admissionApplicationId:admission._id,feePackageId:feePackage._id,feePackageVersion:feePackage.version,packageSnapshot:snapshot(feePackage),totalAmount:feePackage.totalAmount,installments,createdBy:req.user._id,updatedBy:req.user._id});}
  else{if(plan.totalPaid>0)throw Object.assign(new Error('Fee package cannot be replaced after payments have been posted.'),{status:409});plan.feePackageId=feePackage._id;plan.feePackageVersion=feePackage.version;plan.packageSnapshot=snapshot(feePackage);plan.totalAmount=feePackage.totalAmount;plan.installments=installments;plan.updatedBy=req.user._id;await plan.save();}
  admission.feePackageId=feePackage._id;admission.studentFeePlanId=plan._id;if(admission.status==='admitted')admission.status='pending_admission';await admission.save();await audit(req,'ASSIGN_FEE_PACKAGE','StudentFeePlan',plan._id,{admissionId:admission._id,feePackageId:feePackage._id,feePackageVersion:feePackage.version});res.json(plan);
};

exports.updateInstallments=async(req,res)=>{
  const plan=await StudentFeePlan.findOne(req.tenantFilter({_id:req.params.id}));if(!plan)throw Object.assign(new Error('Student fee plan not found'),{status:404});if(!Array.isArray(req.body.installments))throw Object.assign(new Error('Installments array is required'),{status:400});if(!['annual','semester'].includes(plan.billingCycle))throw Object.assign(new Error('Installments are available only for Annual or Semester Tuition Fee.'),{status:400});const total=req.body.installments.reduce((s,i)=>s+Number(i.amount||0),0);const tuitionAmount=Number((plan.packageLines||[]).find(x=>String(x.feeHeadCode||'').toUpperCase()==='TUITION')?.finalAmount||plan.totalAmount);if(Math.abs(total-tuitionAmount)>0.01)throw Object.assign(new Error('Installment total must equal the student Tuition Fee after discount.'),{status:400});
  /* BUSINESS RULE: master package may be locked; student installment plan is still editable. No separate installment history is stored. */
  plan.installments=req.body.installments.map((i,x)=>({title:i.title||`Installment ${x+1}`,amount:Number(i.amount),dueDate:i.dueDate||undefined,sequence:i.sequence||x+1,paidAmount:0}));plan.updatedBy=req.user._id;await plan.save();await recalc(plan);await audit(req,'UPDATE_INSTALLMENT_PLAN','StudentFeePlan',plan._id,{installmentCount:plan.installments.length});res.json(plan);
};

exports.getAdmissionLedger=async(req,res)=>{const plan=await StudentFeePlan.findOne(req.tenantFilter({admissionApplicationId:req.params.admissionId})).populate('feePackageId','name version isLocked').populate('admissionApplicationId','formNo studentName rollNo status');if(!plan)throw Object.assign(new Error('Student fee plan not found'),{status:404});const payments=await FeePayment.find({collegeId:plan.collegeId,studentFeePlanId:plan._id}).populate('postedBy','name email').sort({paymentDate:-1});res.json({plan,payments});};

exports.postPayment=async(req,res)=>{
  const collegeId=collegeIdOf(req),plan=await StudentFeePlan.findOne({_id:req.params.planId,collegeId});if(!plan)throw Object.assign(new Error('Student fee plan not found'),{status:404});const amount=Number(req.body.amount);if(!Number.isFinite(amount)||amount<=0)throw Object.assign(new Error('Valid payment amount is required'),{status:400});if(amount>plan.balance+0.01)throw Object.assign(new Error('Payment amount cannot exceed outstanding balance.'),{status:409});const admission=await AdmissionApplication.findOne({_id:plan.admissionApplicationId,collegeId});if(!admission)throw Object.assign(new Error('Admission record not found'),{status:404});
  /* Result is intentionally NOT checked. Fee may be posted before result. */
  const n=await seq.nextNumber(collegeId,`fee-receipt-${new Date().getFullYear()}`),payment=await FeePayment.create({collegeId,admissionApplicationId:admission._id,studentFeePlanId:plan._id,installmentId:req.body.installmentId||undefined,receiptNo:`RCPT-${new Date().getFullYear()}-${String(n).padStart(6,'0')}`,amount,paymentDate:req.body.paymentDate||new Date(),paymentMethod:await resolveCollegePaymentMethod(collegeId, req.body.paymentMethod),referenceNo:req.body.referenceNo,remarks:req.body.remarks,postedBy:req.user._id});
  await recalc(plan);
  await promoteAdmissionAfterPostedPayment(req, admission);
  await financeService.postSourceTransaction({collegeId,branchId:admission.branchId,type:'income',amount:payment.amount,transactionDate:payment.paymentDate,paymentMethod:financeMethod(payment.paymentMethod),accountId:req.body.financeAccountId,headCode:'STUDENT_FEES',sourceModule:'fees',sourceDocumentType:'FeePayment',sourceDocumentId:payment._id,sourceReference:payment.receiptNo,description:`Student fee payment ${payment.receiptNo}${admission.rollNo?` - ${admission.rollNo}`:''}`,userId:req.user._id});
  await audit(req,'POST_FEE_PAYMENT','FeePayment',payment._id,{admissionId:admission._id,receiptNo:payment.receiptNo,amount,rollNo:admission.rollNo});
  res.status(201).json({payment,plan,admission});
};

// v3.29 Fee Structure + Student Fee Package workflow
const FeeStructureMaster = require('../../models/FeeStructure');
const SYSTEM_FEE_HEADS = require('../../constants/systemFeeHeads');
const FeePosting = require('../../models/FeePosting');

function feeRoles(req) {
  const roles = [
    ...(req.user?.roleCodes || []),
    ...(req.user?.roles || []).map(role => role?.code),
    req.user?.roleCode
  ].filter(Boolean).map(code => String(code).toLowerCase());
  return new Set(roles);
}

function canCreateFeeStructure(req) {
  const roles = feeRoles(req);
  return ['accountant', 'admin', 'principal', 'director'].some(code => roles.has(code));
}
function canEditFeeStructure(req) {
  if (req.user?.systemRole === 'platform_owner') return true;
  const roles = feeRoles(req);
  const permissions = new Set(req.user?.effectivePermissions || []);
  return roles.has('director') || permissions.has('*') || permissions.has('MANAGE_FEE_STRUCTURE');
}
function canApproveFeeStructure(req) {
  const roles = feeRoles(req);
  return roles.has('principal') || roles.has('director');
}
function structureApproval(req) {
  const now = new Date();
  if (canApproveFeeStructure(req)) {
    return {
      approvalStatus: 'approved',
      submittedBy: req.user._id,
      submittedAt: now,
      approvedBy: req.user._id,
      approvedAt: now
    };
  }
  return {
    approvalStatus: 'pending_approval',
    submittedBy: req.user._id,
    submittedAt: now
  };
}
function systemHeadMap() {
  return new Map(SYSTEM_FEE_HEADS.map(head => [head.code, head]));
}
function moduleDefinedHead(code) {
  return ['HOSTEL', 'TRANSPORT'].includes(String(code || '').trim().toUpperCase());
}
function feeStructureHeadMap() {
  return new Map(SYSTEM_FEE_HEADS.filter(head => !moduleDefinedHead(head.code)).map(head => [head.code, head]));
}
function normalizeLineInstallments(code, cycle, installments, amount) {
  // Business rule: only annual Tuition Fee can be split into installments.
  if (String(code).toUpperCase() !== 'TUITION' || cycle !== 'annual') return [];
  const rows = Array.isArray(installments) ? installments : [];
  if (rows.length < 1 || rows.length > 7) {
    throw Object.assign(new Error('Annual TUITION requires 1 to 7 default installments.'), { status: 400 });
  }
  const normalized = rows.map((item, index) => {
    const installmentAmount = Number(item.amount);
    if (!Number.isFinite(installmentAmount) || installmentAmount < 0) {
      throw Object.assign(new Error(`Invalid amount for ${code} installment ${index + 1}.`), { status: 400 });
    }
    if (!item.dueDate) {
      throw Object.assign(new Error(`Due date is required for ${code} installment ${index + 1}.`), { status: 400 });
    }
    return {
      title: String(item.title || `Installment ${index + 1}`).trim(),
      sequence: index + 1,
      amount: installmentAmount,
      dueDate: item.dueDate
    };
  });
  const total = normalized.reduce((sum, x) => sum + x.amount, 0);
  if (Math.abs(total - Number(amount || 0)) > 0.01) {
    throw Object.assign(new Error('TUITION installment total must equal the Tuition Fee amount.'), { status: 400 });
  }
  return normalized;
}
function canonicalFeeType(line) {
  const raw = String(line?.feeType || line?.feeCycle || 'monthly').toLowerCase();
  if (raw === 'annual') return 'annual';
  if (raw === 'semester') return 'semester';
  if (raw === 'once' || raw === 'periodic') return 'once';
  return 'monthly';
}

function normalizeStructureLines(lines) {
  const allowed = feeStructureHeadMap();
  const seen = new Set();
  const result = [];
  for (const raw of Array.isArray(lines) ? lines : []) {
    const code = String(raw.feeHeadCode || '').trim().toUpperCase();
    if (moduleDefinedHead(code) && Number(raw.amount || 0) > 0) {
      throw Object.assign(new Error(`${code === 'HOSTEL' ? 'Hostel' : 'Transport'} Fee is defined in the ${code === 'HOSTEL' ? 'Hostel' : 'Transport'} module and cannot be added to Fee Structure.`), { status: 400 });
    }
    if (!code || !allowed.has(code) || seen.has(code)) continue;
    const amount = Number(raw.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw Object.assign(new Error(`Invalid amount for ${code}.`), { status: 400 });
    }
    if (amount <= 0) continue;
    const feeType = canonicalFeeType(raw);
    seen.add(code);
    result.push({
      feeHeadCode: code,
      amount,
      feeType,
      feeCycle: feeType, // legacy compatibility mirror
      defaultInstallments: []
    });
  }
  if (!result.length) {
    throw Object.assign(new Error('Enter an amount for at least one Fee Head.'), { status: 400 });
  }
  return result;
}
function normalizeDefaultInstallments(billingCycle, installments, structureTotal) {
  if (billingCycle === 'monthly') return [];
  const rows = Array.isArray(installments) ? installments : [];
  if (rows.length < 1 || rows.length > 7) {
    throw Object.assign(new Error('Annual Fee Structure requires 1 to 7 default installments.'), { status: 400 });
  }
  const normalized = rows.map((item, index) => {
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount < 0) throw Object.assign(new Error(`Invalid amount for installment ${index + 1}.`), { status: 400 });
    if (!item.dueDate) throw Object.assign(new Error(`Due date is required for installment ${index + 1}.`), { status: 400 });
    return { title: String(item.title || `Installment ${index + 1}`).trim(), sequence: index + 1, amount, dueDate: item.dueDate };
  });
  const total = normalized.reduce((sum, x) => sum + x.amount, 0);
  if (Math.abs(total - Number(structureTotal || 0)) > 0.01) {
    throw Object.assign(new Error('Default installment total must equal the Fee Structure total.'), { status: 400 });
  }
  return normalized;
}
function structureSnapshot(row) {
  return {
    feeStructureId: row._id,
    name: row.name,
    academicSessionId: row.academicSessionId,
    programIds: row.programIds,
    version: row.version,
    billingCycle: row.billingCycle || 'monthly',
    defaultInstallments: [],
    feeLines: (row.feeLines || []).map(line => ({
      feeHeadCode: line.feeHeadCode,
      amount: Number(line.amount || 0),
      feeType: canonicalFeeType(line),
      feeCycle: canonicalFeeType(line),
      defaultInstallments: []
    })),
    totalAmount: row.totalAmount
  };
}
function calculateStudentLines(structure, adjustments) {
  const byCode = new Map((Array.isArray(adjustments) ? adjustments : []).map(x => [String(x.feeHeadCode || '').toUpperCase(), x]));
  // Hostel and Transport amounts are owned by their modules and must never be
  // copied into a student package/fee structure as a second source of truth.
  return (structure.feeLines || []).filter(line => !moduleDefinedHead(line.feeHeadCode)).map(line => {
    const code = String(line.feeHeadCode).toUpperCase();
    const standardAmount = Number(line.amount || 0);
    const adj = byCode.get(code) || {};
    const discountAmount = Number(adj.discountAmount || 0);
    if (!Number.isFinite(discountAmount) || !Number.isInteger(discountAmount) || discountAmount < 0 || discountAmount > standardAmount || discountAmount % 10 !== 0) {
      throw Object.assign(new Error(`Discount for ${code} must be a multiple of 10 between 0 and ${standardAmount}.`), { status: 400 });
    }
    return {
      feeHeadCode: code,
      standardAmount,
      discountAmount: Number(discountAmount.toFixed(2)),
      finalAmount: Number((standardAmount - discountAmount).toFixed(2)),
      feeType: canonicalFeeType(line),
      feeCycle: canonicalFeeType(line)
    };
  });
}
function studentInstallmentsFromStructure(structure, finalTuitionAmount) {
  if ((structure.billingCycle || 'monthly') !== 'annual') return [];
  const defaults = structure.defaultInstallments || [];
  if (!defaults.length) return [];
  const sourceTotal = defaults.reduce((s, x) => s + Number(x.amount || 0), 0);
  if (sourceTotal <= 0) return defaults.map((x, index) => ({ title: x.title || `Installment ${index + 1}`, amount: 0, dueDate: x.dueDate, sequence: index + 1, paidAmount: 0 }));
  let used = 0;
  return defaults.map((x, index) => {
    const last = index === defaults.length - 1;
    const amount = last ? Number((finalTuitionAmount - used).toFixed(2)) : Number((finalTuitionAmount * Number(x.amount || 0) / sourceTotal).toFixed(2));
    used += amount;
    return { title: x.title || `Installment ${index + 1}`, amount, dueDate: x.dueDate, sequence: index + 1, paidAmount: 0 };
  });
}

function normalizeStudentInstallments(structure, packageLines, rawInstallments) {
  const tuition = (packageLines || []).find(x => String(x.feeHeadCode || '').toUpperCase() === 'TUITION');
  const tuitionCycle = canonicalFeeType(tuition);
  const tuitionAmount = Number(tuition?.finalAmount || 0);
  if (!['annual','semester'].includes(tuitionCycle) || tuitionAmount <= 0) return [];
  if (!Number.isInteger(tuitionAmount) || tuitionAmount % 10 !== 0) {
    throw Object.assign(new Error('Final Tuition Fee must be a multiple of 10 before installments can be defined.'), { status: 400 });
  }
  const rows = Array.isArray(rawInstallments) ? rawInstallments : [];
  if (rows.length < 1 || rows.length > 7) {
    throw Object.assign(new Error(`${tuitionCycle === 'semester' ? 'Semester' : 'Annual'} Tuition Fee requires 1 to 7 student installments.`), { status: 400 });
  }
  const normalized = rows.map((item, index) => {
    const amount = Number(item.amount || 0);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0 || amount % 10 !== 0) throw Object.assign(new Error(`Installment amount at row ${index + 1} must be a multiple of 10.`), { status: 400 });
    if (!item.dueDate) throw Object.assign(new Error(`Due date is required for installment ${index + 1}.`), { status: 400 });
    return {
      title: String(item.title || `Installment ${index + 1}`).trim(),
      amount: Number(amount.toFixed(2)),
      dueDate: item.dueDate,
      sequence: index + 1,
      paidAmount: 0
    };
  });
  const total = normalized.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  if (Math.abs(total - tuitionAmount) > 0.01) {
    throw Object.assign(new Error('Student installment total must equal the final Tuition Fee after discount.'), { status: 400 });
  }
  return normalized;
}

exports.listDefaultInstallments = async (req, res) => {
  const rows = await FeeDefaultInstallment.find(req.tenantFilter())
    .populate('academicSessionId', 'name')
    .populate('programId', 'name code')
    .sort({ createdAt: -1 });
  res.json(rows);
};

exports.saveDefaultInstallments = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const { academicSessionId, programId } = req.body || {};
  const installments = Array.isArray(req.body?.installments) ? req.body.installments : [];
  if (!academicSessionId || !programId) throw Object.assign(new Error('Academic Session and Program / Class are required.'), { status: 400 });
  if (installments.length < 1 || installments.length > 7) throw Object.assign(new Error('Default installment count must be between 1 and 7.'), { status: 400 });
  const [session, program] = await Promise.all([
    AcademicSession.findOne({ _id: academicSessionId, collegeId }).select('_id'),
    Program.findOne({ _id: programId, collegeId }).select('_id')
  ]);
  if (!session || !program) throw Object.assign(new Error('Invalid Academic Session or Program / Class.'), { status: 400 });
  const normalized = installments.map((item, index) => {
    if (!item?.dueDate) throw Object.assign(new Error(`Due date is required for installment ${index + 1}.`), { status: 400 });
    return { title: String(item.title || `Installment ${index + 1}`).trim(), sequence: index + 1, dueDate: item.dueDate };
  });
  const row = await FeeDefaultInstallment.findOneAndUpdate(
    { collegeId, academicSessionId, programId },
    { $set: { installments: normalized, updatedBy: req.user._id }, $setOnInsert: { createdBy: req.user._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).populate('academicSessionId', 'name').populate('programId', 'name code');
  await audit(req, 'SAVE_DEFAULT_FEE_INSTALLMENTS', 'FeeDefaultInstallment', row._id, { academicSessionId, programId, installmentCount: normalized.length });
  res.json(row);
};

exports.listSystemFeeHeads = async (req, res) => {
  res.json(SYSTEM_FEE_HEADS);
};

exports.listFeeStructures = async (req, res) => {
  const rows = await FeeStructureMaster.find(req.tenantFilter())
    .populate('academicSessionId', 'name')
    .populate('programIds', 'name code')
    .populate('createdBy updatedBy submittedBy approvedBy rejectedBy', 'name email')
    .sort({ createdAt: -1 });
  res.json(rows);
};

exports.createFeeStructure = async (req, res) => {
  if (!canCreateFeeStructure(req)) {
    throw Object.assign(new Error('Only Accountant, Admin, Principal or Director can create Fee Structures.'), { status: 403 });
  }
  const collegeId = collegeIdOf(req);
  const programIds = [...new Set((req.body.programIds || []).map(String))];
  if (!programIds.length) throw Object.assign(new Error('Select at least one Class / Program.'), { status: 400 });
  const [session, programCount] = await Promise.all([
    AcademicSession.findOne({ _id: req.body.academicSessionId, collegeId }),
    Program.countDocuments({ _id: { $in: programIds }, collegeId })
  ]);
  if (!session || programCount !== programIds.length) {
    throw Object.assign(new Error('Invalid Academic Session or Class / Program selection.'), { status: 400 });
  }
  const feeLines = normalizeStructureLines(req.body.feeLines);
  if (feeLines.some(line => canonicalFeeType(line) === 'semester')) {
    const selectedPrograms = await Program.find({ _id: { $in: programIds }, collegeId }).select('name academicType');
    if (selectedPrograms.length !== programIds.length || selectedPrograms.some(program => String(program.academicType || '').toLowerCase() !== 'university')) {
      throw Object.assign(new Error('Semester fee cycle can only be used for University programs.'), { status: 400 });
    }
  }
  const structureTotal = feeLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const tuitionLine = feeLines.find(line => line.feeHeadCode === 'TUITION');
  const tuitionCycle = canonicalFeeType(tuitionLine);
  const billingCycle = ['annual','semester'].includes(tuitionCycle) ? tuitionCycle : 'monthly';
  const defaultInstallments = [];
  const approval = structureApproval(req);
  const row = await FeeStructureMaster.create({
    collegeId,
    name: req.body.name,
    academicSessionId: req.body.academicSessionId,
    programIds,
    feeLines,
    billingCycle,
    defaultInstallments,
    createdBy: req.user._id,
    updatedBy: req.user._id,
    ...approval,
    history: [{
      action: approval.approvalStatus === 'approved' ? 'CREATED_AND_APPROVED' : 'CREATED_AND_SUBMITTED',
      by: req.user._id
    }]
  });
  await audit(req, 'CREATE_FEE_STRUCTURE', 'FeeStructure', row._id, {
    approvalStatus: row.approvalStatus,
    programCount: programIds.length,
    totalAmount: row.totalAmount
  });
  res.status(201).json(row);
};


exports.reviseFeeStructure = async (req, res) => {
  if (!canEditFeeStructure(req)) {
    throw Object.assign(new Error('Fee Structure edit permission is required.'), { status: 403 });
  }
  const collegeId = collegeIdOf(req);
  const source = await FeeStructureMaster.findOne(req.tenantFilter({ _id: req.params.id }));
  if (!source) throw Object.assign(new Error('Fee Structure not found'), { status: 404 });

  const programIds = [...new Set((req.body.programIds || []).map(String))];
  if (!programIds.length) throw Object.assign(new Error('Select at least one Class / Program.'), { status: 400 });
  const [session, programCount] = await Promise.all([
    AcademicSession.findOne({ _id: req.body.academicSessionId, collegeId }),
    Program.countDocuments({ _id: { $in: programIds }, collegeId })
  ]);
  if (!session || programCount !== programIds.length) {
    throw Object.assign(new Error('Invalid Academic Session or Class / Program selection.'), { status: 400 });
  }

  const feeLines = normalizeStructureLines(req.body.feeLines);
  if (feeLines.some(line => canonicalFeeType(line) === 'semester')) {
    const selectedPrograms = await Program.find({ _id: { $in: programIds }, collegeId }).select('name academicType');
    if (selectedPrograms.length !== programIds.length || selectedPrograms.some(program => String(program.academicType || '').toLowerCase() !== 'university')) {
      throw Object.assign(new Error('Semester fee cycle can only be used for University programs.'), { status: 400 });
    }
  }
  const tuitionLine = feeLines.find(line => line.feeHeadCode === 'TUITION');
  const tuitionCycle = canonicalFeeType(tuitionLine);
  const billingCycle = ['annual','semester'].includes(tuitionCycle) ? tuitionCycle : 'monthly';
  const defaultInstallments = [];
  const approval = structureApproval(req);
  const latest = await FeeStructureMaster.findOne({
    collegeId,
    name: String(req.body.name || source.name).trim(),
    academicSessionId: req.body.academicSessionId
  }).sort({ version: -1 }).select('version');
  const nextVersion = Math.max(Number(source.version || 1), Number(latest?.version || 0)) + 1;

  const row = await FeeStructureMaster.create({
    collegeId,
    name: String(req.body.name || source.name).trim(),
    academicSessionId: req.body.academicSessionId,
    programIds,
    feeLines,
    billingCycle,
    defaultInstallments,
    version: nextVersion,
    parentStructureId: source._id,
    createdBy: req.user._id,
    updatedBy: req.user._id,
    ...approval,
    history: [{
      action: approval.approvalStatus === 'approved' ? 'REVISION_CREATED_AND_APPROVED' : 'REVISION_CREATED_AND_SUBMITTED',
      by: req.user._id,
      changes: { revisedFrom: source._id, revisedFromVersion: source.version }
    }]
  });

  // Principal/Director revisions become effective immediately. For Accountant/Admin,
  // keep the old approved version active until the new revision is approved.
  if (row.approvalStatus === 'approved' && source.approvalStatus === 'approved') {
    source.isActive = false;
    source.approvalStatus = 'inactive';
    source.updatedBy = req.user._id;
    source.history.push({ action: 'SUPERSEDED', by: req.user._id, changes: { supersededBy: row._id, version: row.version } });
    await source.save();
  }

  await audit(req, 'REVISE_FEE_STRUCTURE', 'FeeStructure', row._id, {
    revisedFrom: source._id,
    version: row.version,
    approvalStatus: row.approvalStatus
  });
  res.status(201).json(row);
};

exports.approveFeeStructure = async (req, res) => {
  if (!canApproveFeeStructure(req)) throw Object.assign(new Error('Only Principal or Director can approve Fee Structures.'), { status: 403 });
  const row = await FeeStructureMaster.findOne(req.tenantFilter({ _id: req.params.id }));
  if (!row) throw Object.assign(new Error('Fee Structure not found'), { status: 404 });
  row.approvalStatus = 'approved';
  row.approvedBy = req.user._id;
  row.approvedAt = new Date();
  row.rejectedBy = undefined;
  row.rejectedAt = undefined;
  row.approvalRemarks = String(req.body.remarks || '').trim();
  row.history.push({ action: 'APPROVED', by: req.user._id, remarks: row.approvalRemarks });
  await row.save();
  if (row.parentStructureId) {
    const parent = await FeeStructureMaster.findOne({ _id: row.parentStructureId, collegeId: collegeIdOf(req) });
    if (parent && parent.approvalStatus === 'approved') {
      parent.isActive = false;
      parent.approvalStatus = 'inactive';
      parent.updatedBy = req.user._id;
      parent.history.push({ action: 'SUPERSEDED', by: req.user._id, changes: { supersededBy: row._id, version: row.version } });
      await parent.save();
    }
  }
  await audit(req, 'APPROVE_FEE_STRUCTURE', 'FeeStructure', row._id);
  res.json(row);
};

exports.rejectFeeStructure = async (req, res) => {
  if (!canApproveFeeStructure(req)) throw Object.assign(new Error('Only Principal or Director can reject Fee Structures.'), { status: 403 });
  const row = await FeeStructureMaster.findOne(req.tenantFilter({ _id: req.params.id }));
  if (!row) throw Object.assign(new Error('Fee Structure not found'), { status: 404 });
  row.approvalStatus = 'rejected';
  row.rejectedBy = req.user._id;
  row.rejectedAt = new Date();
  row.approvalRemarks = String(req.body.remarks || '').trim();
  row.history.push({ action: 'REJECTED', by: req.user._id, remarks: row.approvalRemarks });
  await row.save();
  await audit(req, 'REJECT_FEE_STRUCTURE', 'FeeStructure', row._id);
  res.json(row);
};

exports.listStudentFeePackages = async (req, res) => {
  const admissionQuery = req.tenantFilter({
    status: { $in: ['fee_pending', 'provisional', 'confirmed'] }
  });
  if (req.query.programId) admissionQuery.programId = req.query.programId;
  if (req.query.academicSessionId) admissionQuery.academicSessionId = req.query.academicSessionId;

  const admissions = await AdmissionApplication.find(admissionQuery)
    .populate('programId', 'name code')
    .populate('academicSessionId', 'name')
    .sort({ createdAt: -1 })
    .lean();
  const plans = await StudentFeePlan.find({
    collegeId: collegeIdOf(req),
    admissionApplicationId: { $in: admissions.map(x => x._id) }
  })
    .populate('feeStructureId', 'name version approvalStatus')
    .populate('createdBy updatedBy', 'name email')
    .lean();
  const planMap = new Map(plans.map(plan => [String(plan.admissionApplicationId), plan]));
  res.json(admissions.map(admission => ({ admission, plan: planMap.get(String(admission._id)) || null })));
};

exports.getApplicableFeeStructures = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const admission = await AdmissionApplication.findOne({ _id: req.params.admissionId, collegeId });
  if (!admission) throw Object.assign(new Error('Admission record not found'), { status: 404 });
  if (!admission.academicSessionId || !admission.programId) {
    return res.json([]);
  }
  const rows = await FeeStructureMaster.find({
    collegeId,
    approvalStatus: 'approved',
    isActive: true,
    academicSessionId: admission.academicSessionId,
    programIds: admission.programId
  })
    .populate('academicSessionId', 'name')
    .populate('programIds', 'name code')
    .sort({ version: -1, createdAt: -1 });
  res.json(rows);
};

async function rebuildInstallmentsAfterPayments(plan, packageLines, rawInstallments, collegeId) {
  const tuition = (packageLines || []).find(x => String(x.feeHeadCode || '').toUpperCase() === 'TUITION');
  const finalTuition = Number(tuition?.finalAmount || 0);
  const existing = Array.from(plan.installments || []);
  const raw = Array.isArray(rawInstallments) ? rawInstallments : [];
  if (raw.length !== existing.length) {
    throw Object.assign(new Error('Installment count cannot be changed after a Tuition installment has been paid.'), { status: 409 });
  }
  const postings = await FeePosting.find({ collegeId, studentFeePlanId: plan._id, status: { $ne: 'cancelled' } }).select('lines').lean();
  const paidBySequence = new Map();
  for (const posting of postings) {
    for (const line of posting.lines || []) {
      if (line.sourceType !== 'scheduled' || String(line.feeHeadCode || '').toUpperCase() !== 'TUITION' || !Number(line.installmentSequence)) continue;
      const paid = Number(line.paidAmount || 0);
      if (paid > 0) paidBySequence.set(Number(line.installmentSequence), (paidBySequence.get(Number(line.installmentSequence)) || 0) + paid);
    }
  }
  const frozen = new Set();
  let frozenTotal = 0;
  existing.forEach((item, index) => {
    const seq = Number(item.sequence || index + 1);
    const paid = Math.max(Number(item.paidAmount || 0), Number(paidBySequence.get(seq) || 0));
    if (paid > 0) { frozen.add(index); frozenTotal += Number(item.amount || 0); }
  });
  if (!frozen.size) return normalizeStudentInstallments(null, packageLines, rawInstallments);
  if (finalTuition + 0.01 < frozenTotal) {
    throw Object.assign(new Error(`Discount cannot reduce Tuition below already-paid installment commitments (${frozenTotal.toFixed(2)}).`), { status: 409 });
  }
  const openIndexes = existing.map((_, i) => i).filter(i => !frozen.has(i));
  if (!openIndexes.length && Math.abs(finalTuition - frozenTotal) > 0.01) {
    throw Object.assign(new Error('All Tuition installments are already paid; Tuition Fee cannot be changed without a refund/credit workflow.'), { status: 409 });
  }
  const remainingCents = Math.max(0, Math.round((finalTuition - frozenTotal) * 100));
  const baseCents = openIndexes.length ? Math.floor(remainingCents / openIndexes.length) : 0;
  const remainder = remainingCents - baseCents * openIndexes.length;
  const lastOpen = openIndexes[openIndexes.length - 1];
  return existing.map((item, index) => {
    const incoming = raw[index] || {};
    if (frozen.has(index)) return { _id: item._id, title: item.title, amount: Number(item.amount || 0), dueDate: item.dueDate, sequence: item.sequence, paidAmount: Number(item.paidAmount || 0) };
    if (!incoming.dueDate) throw Object.assign(new Error(`Due date is required for installment ${index + 1}.`), { status: 400 });
    return {
      _id: item._id,
      title: String(incoming.title || item.title || `Installment ${index + 1}`).trim(),
      amount: Number(((baseCents + (index === lastOpen ? remainder : 0)) / 100).toFixed(2)),
      dueDate: incoming.dueDate,
      sequence: Number(item.sequence || index + 1),
      paidAmount: Number(item.paidAmount || 0)
    };
  });
}

exports.assignStudentFeePackage = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const admission = await AdmissionApplication.findOne({ _id: req.params.admissionId, collegeId });
  if (!admission) throw Object.assign(new Error('Admission record not found'), { status: 404 });
  if (!admission.academicSessionId || !admission.programId) {
    throw Object.assign(new Error('Complete Academic Session and Program of Study before defining the student fee package.'), { status: 409 });
  }

  // Fee Structure is resolved automatically from the student's Session + Program.
  // feeStructureId remains an optional compatibility hint, but the operator no longer chooses it.
  const structureQuery = {
    collegeId,
    approvalStatus: 'approved',
    isActive: true,
    academicSessionId: admission.academicSessionId,
    programIds: admission.programId
  };
  if (req.body.feeStructureId) structureQuery._id = req.body.feeStructureId;
  let structure = await FeeStructureMaster.findOne(structureQuery).sort({ version: -1, createdAt: -1 });
  if (!structure && req.body.feeStructureId) {
    delete structureQuery._id;
    structure = await FeeStructureMaster.findOne(structureQuery).sort({ version: -1, createdAt: -1 });
  }
  if (!structure) throw Object.assign(new Error('No approved active Fee Structure exists for this student Session and Program.'), { status: 409 });

  const packageLines = calculateStudentLines(structure, req.body.adjustments);
  const now = new Date();
  let plan = await StudentFeePlan.findOne({ collegeId, admissionApplicationId: admission._id });
  const hasPayments = plan && Number(plan.totalPaid || 0) > 0;
  if (hasPayments && plan.feeStructureId && String(plan.feeStructureId) !== String(structure._id)) {
    throw Object.assign(new Error('Fee Structure cannot be changed after payments have been posted. Only the existing student package/concession can be adjusted.'), { status: 409 });
  }

  const historyEntry = {
    at: now,
    by: req.user._id,
    action: plan ? 'PACKAGE_UPDATED' : 'PACKAGE_CREATED',
    reason: String(req.body.changeReason || '').trim(),
    snapshot: {
      feeStructureId: structure._id,
      feeStructureVersion: structure.version,
      packageLines
    }
  };

  if (!plan) {
    plan = new StudentFeePlan({
      collegeId,
      admissionApplicationId: admission._id,
      enrollmentKey: admission.studentId ? `student:${admission.studentId}` : `admission:${admission._id}`,
      feeStructureId: structure._id,
      feeStructureVersion: structure.version,
      structureSnapshot: structureSnapshot(structure),
      packageLines,
      billingCycle: (() => { const cycle = canonicalFeeType(packageLines.find(x => String(x.feeHeadCode).toUpperCase() === 'TUITION')); return ['annual','semester'].includes(cycle) ? cycle : 'monthly'; })(),
      totalAmount: packageLines.reduce((s, x) => s + x.finalAmount, 0),
      installments: normalizeStudentInstallments(structure, packageLines, req.body.installments),
      packageHistory: [historyEntry],
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
  } else {
    plan.enrollmentKey = plan.enrollmentKey || (admission.studentId ? `student:${admission.studentId}` : `admission:${admission._id}`);
    plan.feePackageId = undefined;
    plan.feePackageVersion = undefined;
    plan.packageSnapshot = undefined;
    plan.feeStructureId = structure._id;
    plan.feeStructureVersion = structure.version;
    plan.structureSnapshot = structureSnapshot(structure);
    plan.packageLines = packageLines;
    plan.billingCycle = canonicalFeeType(packageLines.find(x => String(x.feeHeadCode).toUpperCase() === 'TUITION')) === 'annual' ? 'annual' : 'monthly';
    plan.installments = hasPayments
      ? await rebuildInstallmentsAfterPayments(plan, packageLines, req.body.installments, collegeId)
      : normalizeStudentInstallments(structure, packageLines, req.body.installments);
    plan.updatedBy = req.user._id;
    plan.packageHistory.push(historyEntry);
  }
  await plan.save();

  admission.studentFeePlanId = plan._id;
  // Keep legacy feePackageId untouched only when present on historical admissions.
  await admission.save();
  await audit(req, 'ASSIGN_STUDENT_FEE_PACKAGE', 'StudentFeePlan', plan._id, {
    admissionId: admission._id,
    feeStructureId: structure._id,
    standardAmount: plan.totalStandardAmount,
    discount: plan.totalDiscount,
    finalAmount: plan.totalAmount
  });
  res.json(plan);
};

// v3.31 Fee Posting / voucher workflow -------------------------------------------------
function postingLineOutstanding(line) {
  return Math.max(0, Number(line.amount || 0) - Number(line.paidAmount || 0));
}

function selectedFeeHeadSet(value) {
  if (!Array.isArray(value)) return null;
  const allowed = systemHeadMap();
  return new Set(
    value
      .map(code => String(code || '').trim().toUpperCase())
      .filter(code => allowed.has(code))
  );
}

function selectedHeadAllows(selected, code) {
  return !selected || selected.has(String(code || '').trim().toUpperCase());
}

async function openPostingLines(planId, collegeId, excludePostingId, asOfDate) {
  const q = { collegeId, studentFeePlanId: planId, status: { $ne: 'cancelled' } };
  if (excludePostingId) q._id = { $ne: excludePostingId };
  if (asOfDate) q.$or = [{ dueDate: { $exists: false } }, { dueDate: null }, { dueDate: { $lte: new Date(asOfDate) } }];
  const postings = await FeePosting.find(q).sort({ postingDate: 1, createdAt: 1 });
  const rows = [];
  for (const posting of postings) {
    for (const line of posting.lines || []) {
      const outstanding = postingLineOutstanding(line);
      if (outstanding > 0.01) {
        rows.push({
          postingId: posting._id,
          lineId: line._id,
          voucherNo: posting.voucherNo,
          feeHeadCode: line.feeHeadCode,
          description: line.description,
          amount: Number(line.amount || 0),
          paidAmount: Number(line.paidAmount || 0),
          outstandingAmount: Number(outstanding.toFixed(2)),
          dueDate: posting.dueDate
        });
      }
    }
  }
  return rows;
}

async function refreshPostingPlan(plan) {
  const [postings, payments] = await Promise.all([
    FeePosting.find({ collegeId: plan.collegeId, studentFeePlanId: plan._id, status: { $ne: 'cancelled' } }),
    FeePayment.find({ collegeId: plan.collegeId, studentFeePlanId: plan._id, isReversed: false })
  ]);
  plan.totalPosted = Number(postings.reduce((sum, posting) => sum + (posting.lines || []).reduce((s, line) => s + Number(line.amount || 0), 0), 0).toFixed(2));
  plan.totalPaid = Number(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0).toFixed(2));
  const allocated = payments.reduce((sum, payment) => sum + (payment.allocations || []).reduce((s, x) => s + Number(x.amount || 0), 0), 0);
  const appliedAdvance = postings.reduce((sum, posting) => sum + (posting.lines || []).reduce((s, line) => s + Number(line.advanceApplied || 0), 0), 0);
  plan.advanceCredit = Math.max(0, Number((plan.totalPaid - allocated - appliedAdvance).toFixed(2)));
  // Keep installment paidAmount synchronized with the current posting ledger so the package editor
  // can freeze paid installments and redistribute concessions only to the remaining installments.
  for (const installment of plan.installments || []) installment.paidAmount = 0;
  for (const posting of postings) {
    for (const line of posting.lines || []) {
      if (line.sourceType !== 'scheduled' || String(line.feeHeadCode || '').toUpperCase() !== 'TUITION' || !Number(line.installmentSequence)) continue;
      const installment = (plan.installments || []).find(x => Number(x.sequence) === Number(line.installmentSequence));
      if (installment) installment.paidAmount = Number((Number(installment.paidAmount || 0) + Number(line.paidAmount || 0) + Number(line.advanceApplied || 0)).toFixed(2));
    }
  }
  plan.balance = Math.max(0, Number((plan.totalPosted - plan.totalPaid).toFixed(2)));
  plan.status = plan.totalPaid <= 0 ? 'pending' : (plan.balance > 0 ? 'partial' : 'paid');
  await plan.save();
  return plan;
}

function additionalPostingLines(rawLines) {
  const allowed = systemHeadMap();
  const result = [];
  for (const raw of Array.isArray(rawLines) ? rawLines : []) {
    const code = String(raw.feeHeadCode || '').trim().toUpperCase();
    const amount = Number(raw.amount || 0);
    if (!allowed.has(code) || moduleDefinedHead(code) || !Number.isFinite(amount) || amount <= 0) continue;
    result.push({
      feeHeadCode: code,
      feeType: 'once',
      description: String(raw.description || allowed.get(code)?.name || code).trim(),
      sourceType: 'additional',
      amount: Number(amount.toFixed(2)),
      paidAmount: 0,
      advanceApplied: 0
    });
  }
  return result;
}

function monthWindow(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error('Valid voucher due date is required.'), { status: 400 });
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const label = date.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return { start, end, key, label };
}

function postingHasHeadForMonth(postings, code, monthKey) {
  return (postings || []).some(posting => {
    if (!posting?.dueDate || String(posting.status || '') === 'cancelled') return false;
    const postingMonth = monthWindow(posting.dueDate).key;
    return postingMonth === monthKey && (posting.lines || []).some(line => String(line.feeHeadCode || '').toUpperCase() === code);
  });
}

async function moduleServicePostingLines(plan, voucherDueDate, currentPostings) {
  const admission = await AdmissionApplication.findOne({ _id: plan.admissionApplicationId, collegeId: plan.collegeId })
    .select('studentId academicSessionId')
    .lean();
  if (!admission?.studentId) return [];

  const period = monthWindow(voucherDueDate);
  const common = {
    collegeId: plan.collegeId,
    studentId: admission.studentId,
    academicSessionId: admission.academicSessionId
  };
  const result = [];

  if (!postingHasHeadForMonth(currentPostings, 'HOSTEL', period.key)) {
    const hostel = await HostelAssignment.findOne({
      ...common,
      status: { $in: ['active', 'checked_out'] },
      checkInDate: { $lte: period.end },
      $or: [{ checkOutDate: { $exists: false } }, { checkOutDate: null }, { checkOutDate: { $gte: period.start } }]
    }).sort({ checkInDate: -1, createdAt: -1 }).lean();
    const amount = Number(hostel?.monthlyFee || 0);
    if (amount > 0) result.push({
      feeHeadCode: 'HOSTEL', feeType: 'monthly',
      description: `Hostel Fee ${period.label}`,
      sourceType: 'scheduled', amount: Number(amount.toFixed(2)), paidAmount: 0, advanceApplied: 0,
      dueDate: voucherDueDate
    });
  }

  if (!postingHasHeadForMonth(currentPostings, 'TRANSPORT', period.key)) {
    const transport = await TransportAssignment.findOne({
      ...common,
      status: { $in: ['active', 'ended'] },
      startDate: { $lte: period.end },
      $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: period.start } }]
    }).sort({ startDate: -1, createdAt: -1 }).lean();
    const amount = Number(transport?.monthlyFee || 0);
    if (amount > 0) result.push({
      feeHeadCode: 'TRANSPORT', feeType: 'monthly',
      description: `Transport Fee ${period.label}`,
      sourceType: 'scheduled', amount: Number(amount.toFixed(2)), paidAmount: 0, advanceApplied: 0,
      dueDate: voucherDueDate
    });
  }

  return result;
}

async function scheduledPostingLinesDue(plan, dueDate, existingPostings, body = {}) {
  const cutoff = dueDate ? new Date(dueDate) : new Date();
  if (Number.isNaN(cutoff.getTime())) throw Object.assign(new Error('Valid voucher due date is required.'), { status: 400 });

  const currentPeriodKey = String(body.periodKey || `month-${cutoff.toISOString().slice(0, 7)}`);
  const result = [];
  const currentPostings = (existingPostings || []).filter(x => x.status !== 'cancelled');

  // Once-only fees are checked across the whole enrollment lifecycle, not only this class/session.
  const lifecycleKey = plan.enrollmentKey || `admission:${plan.admissionApplicationId}`;
  const relatedPlans = await StudentFeePlan.find({ collegeId: plan.collegeId, enrollmentKey: lifecycleKey }).select('_id');
  const relatedPlanIds = relatedPlans.length ? relatedPlans.map(x => x._id) : [plan._id];
  const lifecyclePostings = await FeePosting.find({
    collegeId: plan.collegeId,
    studentFeePlanId: { $in: relatedPlanIds },
    status: { $ne: 'cancelled' }
  }).select('studentFeePlanId periodKey lines');

  const everPostedHead = code => lifecyclePostings.some(posting =>
    (posting.lines || []).some(line => String(line.feeHeadCode).toUpperCase() === code)
  );
  const postedInCurrentPlan = code => currentPostings.some(posting =>
    (posting.lines || []).some(line => String(line.feeHeadCode).toUpperCase() === code)
  );
  const postedForPeriod = code => currentPostings.some(posting =>
    String(posting.periodKey || '') === currentPeriodKey &&
    (posting.lines || []).some(line => String(line.feeHeadCode).toUpperCase() === code)
  );

  // Tuition is the only fee allowed in installments. The installment date saved in
  // the Student Package is a reference schedule only. Voucher Due Date is the real
  // payable date and is stored on the generated voucher/posting.
  const tuition = (plan.packageLines || []).find(x => String(x.feeHeadCode).toUpperCase() === 'TUITION');
  const tuitionType = canonicalFeeType(tuition);
  if (tuition && Number(tuition.finalAmount || 0) > 0) {
    if (['annual','semester'].includes(tuitionType)) {
      const postedSequences = new Set();
      for (const posting of currentPostings) {
        for (const line of posting.lines || []) {
          if (line.sourceType === 'scheduled' && Number(line.installmentSequence)) postedSequences.add(Number(line.installmentSequence));
        }
      }
      const requestedSequence = Number(body.installmentSequence || 0);
      const unpaid = (plan.installments || [])
        .filter(item => !postedSequences.has(Number(item.sequence)))
        .sort((a, b) => Number(a.sequence) - Number(b.sequence));
      const installment = requestedSequence
        ? unpaid.find(item => Number(item.sequence) === requestedSequence)
        : unpaid[0];
      if (installment) {
        result.push({
          feeHeadCode: 'TUITION', feeType: tuitionType,
          description: installment.title || `${tuitionType === 'semester' ? 'Semester' : 'Annual'} Installment ${installment.sequence}`,
          sourceType: 'scheduled', amount: Number(installment.amount || 0), paidAmount: 0, advanceApplied: 0,
          installmentSequence: Number(installment.sequence), dueDate
        });
      } else if (!(plan.installments || []).length && !postedInCurrentPlan('TUITION')) {
        // Backward compatibility + valid one-payment Semester/Annual package:
        // older packages may not have an installment array. Treat the complete
        // Tuition amount as one scheduled installment instead of skipping the student.
        result.push({
          feeHeadCode: 'TUITION',
          feeType: tuitionType,
          description: tuitionType === 'semester' ? 'Semester Tuition Fee' : 'Annual Tuition Fee',
          sourceType: 'scheduled',
          amount: Number(tuition.finalAmount || 0),
          paidAmount: 0,
          advanceApplied: 0,
          installmentSequence: 1,
          dueDate
        });
      }
    } else if (!postedForPeriod('TUITION')) {
      const amount = Number(body.scheduledAmount ?? tuition.finalAmount ?? 0);
      if (Number.isFinite(amount) && amount > 0) result.push({
        feeHeadCode: 'TUITION', feeType: 'monthly',
        description: String(body.scheduledDescription || `Tuition Fee ${currentPeriodKey}`).trim(),
        sourceType: 'scheduled', amount: Number(amount.toFixed(2)), paidAmount: 0, advanceApplied: 0, dueDate
      });
    }
  }

  // Every other Fee Structure line is posted according to its recurrence rule.
  // HOSTEL and TRANSPORT are explicitly skipped here because those amounts are
  // defined only by their own operational modules.
  for (const line of plan.packageLines || []) {
    const code = String(line.feeHeadCode || '').toUpperCase();
    if (!code || code === 'TUITION' || moduleDefinedHead(code)) continue;
    const amount = Number(line.finalAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const feeType = canonicalFeeType(line);

    if (feeType === 'once' && !everPostedHead(code)) {
      result.push({ feeHeadCode: code, feeType, description: `${systemHeadMap().get(code)?.name || code.replaceAll('_', ' ')} (Once)`, sourceType: 'scheduled', amount, paidAmount: 0, advanceApplied: 0, dueDate });
    } else if (feeType === 'annual' && !postedInCurrentPlan(code)) {
      result.push({ feeHeadCode: code, feeType, description: `${systemHeadMap().get(code)?.name || code.replaceAll('_', ' ')} (Annual)`, sourceType: 'scheduled', amount, paidAmount: 0, advanceApplied: 0, dueDate });
    } else if (feeType === 'semester' && !postedInCurrentPlan(code)) {
      result.push({ feeHeadCode: code, feeType, description: `${systemHeadMap().get(code)?.name || code.replaceAll('_', ' ')} (Semester)`, sourceType: 'scheduled', amount, paidAmount: 0, advanceApplied: 0, dueDate });
    } else if (feeType === 'monthly' && !postedForPeriod(code)) {
      result.push({ feeHeadCode: code, feeType, description: `${systemHeadMap().get(code)?.name || code.replaceAll('_', ' ')} ${currentPeriodKey}`, sourceType: 'scheduled', amount, paidAmount: 0, advanceApplied: 0, dueDate });
    }
  }

  result.push(...await moduleServicePostingLines(plan, dueDate, currentPostings));
  return result;
}

async function eligibleVoucherHeadsForPlan(plan, dueDate, body = {}) {
  const collegeId = plan.collegeId;
  const periodKey = String(body.periodKey || `due-${String(dueDate || '').slice(0, 10)}`).trim();
  const existing = await FeePosting.find({
    collegeId,
    studentFeePlanId: plan._id,
    status: { $ne: 'cancelled' }
  });

  const scheduled = await scheduledPostingLinesDue(plan, dueDate, existing, { ...body, periodKey });
  const arrears = await openPostingLines(plan._id, collegeId, undefined, dueDate);

  const grouped = new Map();
  const ensure = code => {
    const key = String(code || '').toUpperCase();
    if (!grouped.has(key)) {
      const systemHead = systemHeadMap().get(key);
      grouped.set(key, {
        feeHeadCode: key,
        name: systemHead?.name || key.replaceAll('_', ' '),
        scheduledAmount: 0,
        arrearsAmount: 0,
        totalEligibleAmount: 0,
        scheduledLines: [],
        arrearLines: []
      });
    }
    return grouped.get(key);
  };

  for (const line of scheduled) {
    const row = ensure(line.feeHeadCode);
    row.scheduledAmount = Number((row.scheduledAmount + Number(line.amount || 0)).toFixed(2));
    row.scheduledLines.push({
      description: line.description,
      amount: Number(line.amount || 0),
      installmentSequence: line.installmentSequence,
      dueDate: line.dueDate
    });
  }

  for (const line of arrears) {
    const row = ensure(line.feeHeadCode);
    row.arrearsAmount = Number((row.arrearsAmount + Number(line.outstandingAmount || 0)).toFixed(2));
    row.arrearLines.push({
      voucherNo: line.voucherNo,
      description: line.description,
      outstandingAmount: Number(line.outstandingAmount || 0),
      dueDate: line.dueDate
    });
  }

  return [...grouped.values()]
    .map(row => ({
      ...row,
      totalEligibleAmount: Number((row.scheduledAmount + row.arrearsAmount).toFixed(2))
    }))
    .filter(row => row.totalEligibleAmount > 0.01)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function createPostingForPlan(req, plan, admission, options = {}) {
  if (admission.studentId) {
    const activeStudent = await Student.findOne({ _id: admission.studentId, collegeId: collegeIdOf(req) }).select('status');
    if (activeStudent && activeStudent.status !== 'active') {
      throw Object.assign(new Error(`Student is ${activeStudent.status} and is excluded from new voucher generation.`), { status: 409 });
    }
  }
  const collegeId = collegeIdOf(req);
  const dueDate = options.dueDate || req.body.dueDate;
  if (!dueDate) throw Object.assign(new Error('Voucher due date is required.'), { status: 400 });
  const periodKey = String(options.periodKey || req.body.periodKey || `due-${String(dueDate).slice(0, 10)}`).trim();
  const existing = await FeePosting.find({ collegeId, studentFeePlanId: plan._id, status: { $ne: 'cancelled' } });
  const rawSelected = options.selectedFeeHeadCodes ?? req.body.selectedFeeHeadCodes;
  const selectedHeads = selectedFeeHeadSet(rawSelected);

  const scheduledAll = await scheduledPostingLinesDue(plan, dueDate, existing, { ...req.body, ...options, periodKey });
  const scheduled = scheduledAll.filter(line => selectedHeadAllows(selectedHeads, line.feeHeadCode));
  const additional = additionalPostingLines(options.additionalLines ?? req.body.additionalLines);
  const lines = [...scheduled, ...additional].filter(x => Number(x.amount || 0) > 0);

  const arrears = await openPostingLines(plan._id, collegeId, undefined, dueDate);
  const arrearsSnapshot = arrears
    .filter(line => selectedHeadAllows(selectedHeads, line.feeHeadCode))
    .map(x => ({
      postingId: x.postingId,
      lineId: x.lineId,
      feeHeadCode: x.feeHeadCode,
      description: x.description,
      outstandingAmount: x.outstandingAmount
    }));
  if (!lines.length && !arrearsSnapshot.length) return null;

  await refreshPostingPlan(plan);
  let advance = Number(plan.advanceCredit || 0);
  if (advance > 0) {
    for (const line of lines) {
      if (advance <= 0.01) break;
      const applied = Math.min(advance, Number(line.amount || 0));
      line.paidAmount = Number(applied.toFixed(2));
      line.advanceApplied = Number(applied.toFixed(2));
      advance = Number((advance - applied).toFixed(2));
    }
  }

  // Voucher number follows the student's academic session, not the server calendar year.
  const voucherSession = await AcademicSession.findOne({ _id: admission.academicSessionId, collegeId });
  if (!voucherSession) throw Object.assign(new Error('Valid academic session is required for voucher numbering.'), { status: 409 });
  const { sessionYear } = require('../../services/rollNumberService');
  const voucherYear = sessionYear(voucherSession);
  const n = await seq.nextNumber(collegeId, `fee-voucher-${voucherYear}`);
  const resolvedVoucherType = await resolveCollegeVoucherType(collegeId, options.voucherType || req.body.voucherType);
  return FeePosting.create({
    collegeId,
    admissionApplicationId: admission._id,
    studentFeePlanId: plan._id,
    voucherNo: `V${String(voucherYear).slice(-2)}${String(n).padStart(6, '0')}`,
    batchNo: options.batchNo,
    voucherType: resolvedVoucherType,
    postingDate: options.postingDate || req.body.postingDate || new Date(),
    dueDate,
    billingCycle: plan.billingCycle || 'monthly',
    periodKey,
    installmentSequence: scheduled.length === 1 ? scheduled[0].installmentSequence : undefined,
    lines,
    arrearsSnapshot,
    remarks: String(options.remarks ?? req.body.remarks ?? '').trim(),
    postedBy: req.user._id
  });
}


exports.getFeePostingStudents = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const plans = await StudentFeePlan.find({ collegeId, feeStructureId: { $exists: true, $ne: null } })
    .populate({
      path: 'admissionApplicationId',
      select: 'studentName fatherName formNo rollNo programId academicSessionId',
      populate: [
        { path: 'programId', select: 'name code' },
        { path: 'academicSessionId', select: 'name' }
      ]
    })
    .populate('feeStructureId', 'name billingCycle version')
    .sort({ updatedAt: -1 });

  const result = [];
  for (const plan of plans) {
    if (!plan.admissionApplicationId) continue;
    const openLines = await openPostingLines(plan._id, collegeId);
    result.push({
      plan,
      openBalance: Number(openLines.reduce((sum, x) => sum + x.outstandingAmount, 0).toFixed(2)),
      openLineCount: openLines.length,
      advanceCredit: Number(plan.advanceCredit || 0)
    });
  }
  res.json(result);
};

exports.getPostingSummary = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const plan = await StudentFeePlan.findOne({ _id: req.params.planId, collegeId })
    .populate({ path: 'admissionApplicationId', select: 'studentName fatherName formNo rollNo programId academicSessionId', populate: [{ path: 'programId', select: 'name code' }, { path: 'academicSessionId', select: 'name' }] })
    .populate('feeStructureId', 'name billingCycle version');
  if (!plan) throw Object.assign(new Error('Student fee plan not found'), { status: 404 });
  await refreshPostingPlan(plan);
  const [postings, openLines, payments] = await Promise.all([
    FeePosting.find({ collegeId, studentFeePlanId: plan._id }).populate('postedBy', 'name email').sort({ postingDate: -1, createdAt: -1 }),
    openPostingLines(plan._id, collegeId),
    FeePayment.find({ collegeId, studentFeePlanId: plan._id, isReversed: false }).populate('postedBy', 'name email').sort({ paymentDate: -1 })
  ]);
  const lifecycleKey = plan.enrollmentKey || `admission:${plan.admissionApplicationId?._id || plan.admissionApplicationId}`;
  const relatedPlans = await StudentFeePlan.find({ collegeId, enrollmentKey: lifecycleKey }).select('_id');
  const lifecyclePostings = await FeePosting.find({ collegeId, studentFeePlanId: { $in: relatedPlans.length ? relatedPlans.map(x => x._id) : [plan._id] }, status: { $ne: 'cancelled' } }).select('periodKey lines');
  const lifecyclePostedHeads = [...new Set(lifecyclePostings.flatMap(posting => (posting.lines || []).map(line => String(line.feeHeadCode || '').toUpperCase())).filter(Boolean))];
  res.json({ plan, postings, openLines, payments, systemHeads: SYSTEM_FEE_HEADS, lifecyclePostedHeads });
};

exports.getEligibleVoucherHeads = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const dueDate = req.body.dueDate;
  if (!dueDate) throw Object.assign(new Error('Voucher due date is required.'), { status: 400 });

  const plan = await StudentFeePlan.findOne({ _id: req.params.planId, collegeId });
  if (!plan) throw Object.assign(new Error('Student fee plan not found'), { status: 404 });

  const eligibleHeads = await eligibleVoucherHeadsForPlan(plan, dueDate, req.body || {});
  res.json({
    planId: plan._id,
    dueDate,
    periodKey: String(req.body.periodKey || `due-${String(dueDate).slice(0, 10)}`),
    eligibleHeads
  });
};

exports.createFeePosting = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const plan = await StudentFeePlan.findOne({ _id: req.params.planId, collegeId });
  if (!plan) throw Object.assign(new Error('Student fee plan not found'), { status: 404 });
  const admission = await AdmissionApplication.findOne({ _id: plan.admissionApplicationId, collegeId });
  if (!admission) throw Object.assign(new Error('Admission record not found'), { status: 404 });

  const selectedHeads = selectedFeeHeadSet(req.body.selectedFeeHeadCodes);
  const hasAdditional = Array.isArray(req.body.additionalLines) &&
    req.body.additionalLines.some(line => Number(line?.amount || 0) > 0);

  if (selectedHeads && selectedHeads.size === 0 && !hasAdditional) {
    throw Object.assign(new Error('Select at least one eligible Fee Head for this voucher.'), { status: 400 });
  }

  const posting = await createPostingForPlan(req, plan, admission);
  if (!posting) throw Object.assign(new Error('None of the selected Fee Heads has a pending eligible amount up to the selected due date.'), { status: 409 });
  await refreshPostingPlan(plan);
  await notifyVoucherGenerated(collegeId,admission,posting);
  await audit(req, 'CREATE_FEE_POSTING', 'FeePosting', posting._id, {
    voucherNo: posting.voucherNo,
    dueDate: posting.dueDate,
    newChargesAmount: posting.newChargesAmount,
    arrearsAmount: posting.arrearsAmount,
    voucherAmount: posting.voucherAmount
  });
  res.status(201).json({ posting, plan });
};

exports.createBulkFeePostings = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const resolvedBulkVoucherType = await resolveCollegeVoucherType(collegeId, req.body.voucherType);
  const academicSessionId = String(req.body.academicSessionId || '').trim();
  if (!academicSessionId) throw Object.assign(new Error('Academic Session is required for bulk vouchers.'), { status: 400 });
  const programIds = [...new Set((Array.isArray(req.body.programIds) ? req.body.programIds : []).map(String).filter(Boolean))];
  if (!programIds.length) throw Object.assign(new Error('Select at least one Class / Program for bulk vouchers.'), { status: 400 });

  const selectedHeads = selectedFeeHeadSet(req.body.selectedFeeHeadCodes);
  if (!selectedHeads || selectedHeads.size === 0) {
    throw Object.assign(new Error('Select at least one Fee Head for bulk voucher generation.'), { status: 400 });
  }

  if (!req.body.dueDate) throw Object.assign(new Error('Voucher due date is required.'), { status: 400 });

  // Load the bulk-voucher working set once. The previous implementation re-read the
  // admission document for every fee plan (N+1 queries), which becomes expensive for
  // whole-class / whole-wing voucher generation.
  const admissions = await AdmissionApplication.find({ collegeId, academicSessionId, programId: { $in: programIds } })
    .select('_id studentName rollNo formNo programId academicSessionId studentId status')
    .lean();
  const admissionIds = admissions.map(x => x._id);
  const admissionById = new Map(admissions.map(x => [String(x._id), x]));
  const plans = await StudentFeePlan.find({ collegeId, admissionApplicationId: { $in: admissionIds }, feeStructureId: { $exists: true, $ne: null } });
  const batchN = await seq.nextNumber(collegeId, `fee-voucher-batch-${new Date().getFullYear()}`);
  const batchNo = `VB-${new Date().getFullYear()}-${String(batchN).padStart(5, '0')}`;
  const results = [];
  const skipped = [];

  for (const plan of plans) {
    const admission = admissionById.get(String(plan.admissionApplicationId));
    if (!admission) continue;
    try {
      const posting = await createPostingForPlan(req, plan, admission, {
        batchNo,
        dueDate: req.body.dueDate,
        periodKey: String(req.body.periodKey || `due-${String(req.body.dueDate).slice(0,10)}`),
        additionalLines: req.body.additionalLines || [],
        remarks: req.body.remarks || '',
        voucherType: resolvedBulkVoucherType,
        selectedFeeHeadCodes: [...selectedHeads]
      });
      if (posting) {
        await refreshPostingPlan(plan);
        await notifyVoucherGenerated(collegeId,admission,posting);
        results.push({ planId: plan._id, admissionId: admission._id, voucherNo: posting.voucherNo, voucherAmount: posting.voucherAmount });
      } else skipped.push({
        planId: plan._id,
        admissionId: admission._id,
        studentName: admission.studentName,
        rollNo: admission.rollNo,
        formNo: admission.formNo,
        reason: 'No unpaid/due amount exists for the selected Fee Heads'
      });
    } catch (err) {
      if (err?.code === 11000) {
        skipped.push({ planId: plan._id, admissionId: admission._id, studentName: admission.studentName, rollNo: admission.rollNo, formNo: admission.formNo, reason: 'Voucher number conflict; please retry.' });
      } else {
        skipped.push({ planId: plan._id, admissionId: admission._id, studentName: admission.studentName, rollNo: admission.rollNo, formNo: admission.formNo, reason: err.message });
      }
    }
  }
  await audit(req, 'CREATE_BULK_FEE_POSTINGS', 'FeePostingBatch', null, {
    batchNo,
    academicSessionId,
    programIds,
    dueDate: req.body.dueDate,
    selectedFeeHeadCodes: [...selectedHeads],
    voucherType: resolvedBulkVoucherType,
    generated: results.length,
    skipped: skipped.length
  });
  res.status(201).json({ batchNo, generated: results.length, skipped: skipped.length, vouchers: results, skippedRows: skipped });
};


exports.postAllocatedPayment = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const plan = await StudentFeePlan.findOne({ _id: req.params.planId, collegeId });
  if (!plan) throw Object.assign(new Error('Student fee plan not found'), { status: 404 });
  const admission = await AdmissionApplication.findOne({ _id: plan.admissionApplicationId, collegeId });
  if (!admission) throw Object.assign(new Error('Admission record not found'), { status: 404 });

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error('Valid payment amount is required.'), { status: 400 });
  const challanNo = String(req.body.challanNo || req.body.slipNo || '').trim();
  if (!challanNo) throw Object.assign(new Error('Challan No / Slip No is required for voucher posting.'), { status: 400 });

  const requested = Array.isArray(req.body.allocations) ? req.body.allocations : [];
  const normalized = [];
  const postingCache = new Map();
  let allocatedTotal = 0;
  for (const raw of requested) {
    const allocationAmount = Number(raw.amount || 0);
    if (!Number.isFinite(allocationAmount) || allocationAmount <= 0) continue;
    const key = String(raw.postingId || '');
    let posting = postingCache.get(key);
    if (!posting) {
      posting = await FeePosting.findOne({ _id: raw.postingId, collegeId, studentFeePlanId: plan._id, status: { $ne: 'cancelled' } });
      if (!posting) throw Object.assign(new Error('A selected voucher/posting no longer exists.'), { status: 409 });
      postingCache.set(key, posting);
    }
    const line = posting.lines.id(raw.lineId);
    if (!line) throw Object.assign(new Error('A selected fee line no longer exists.'), { status: 409 });
    const outstanding = postingLineOutstanding(line);
    if (allocationAmount > outstanding + 0.01) throw Object.assign(new Error(`Payment for ${line.description} cannot exceed its outstanding amount.`), { status: 409 });
    normalized.push({ postingId: posting._id, lineId: line._id, feeHeadCode: line.feeHeadCode, amount: allocationAmount });
    allocatedTotal += allocationAmount;
  }
  if (allocatedTotal > amount + 0.01) throw Object.assign(new Error('Allocated amount cannot exceed receipt amount.'), { status: 400 });

  for (const allocation of normalized) {
    const posting = postingCache.get(String(allocation.postingId));
    const line = posting.lines.id(allocation.lineId);
    line.paidAmount = Number((Number(line.paidAmount || 0) + Number(allocation.amount || 0)).toFixed(2));
  }
  for (const posting of postingCache.values()) await posting.save();

  const n = await seq.nextNumber(collegeId, `fee-receipt-${new Date().getFullYear()}`);
  const payment = await FeePayment.create({
    collegeId,
    admissionApplicationId: admission._id,
    studentFeePlanId: plan._id,
    receiptNo: `RCPT-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`,
    amount,
    allocations: normalized,
    paymentDate: req.body.paymentDate || new Date(),
    paymentMethod: await resolveCollegePaymentMethod(collegeId, req.body.paymentMethod),
    challanNo,
    referenceNo: req.body.referenceNo || challanNo,
    remarks: req.body.remarks,
    postedBy: req.user._id
  });

  await refreshPostingPlan(plan);
  await promoteAdmissionAfterPostedPayment(req, admission);
  await financeService.postSourceTransaction({collegeId,branchId:admission.branchId,type:'income',amount:payment.amount,transactionDate:payment.paymentDate,paymentMethod:financeMethod(payment.paymentMethod),accountId:req.body.financeAccountId,headCode:'STUDENT_FEES',sourceModule:'fees',sourceDocumentType:'FeePayment',sourceDocumentId:payment._id,sourceReference:payment.receiptNo,description:`Student fee payment ${payment.receiptNo}${admission.rollNo?` - ${admission.rollNo}`:''}`,userId:req.user._id});
  await audit(req, 'POST_ALLOCATED_FEE_PAYMENT', 'FeePayment', payment._id, {
    receiptNo: payment.receiptNo,
    challanNo: payment.challanNo,
    amount,
    allocatedAmount: allocatedTotal,
    advanceAmount: Math.max(0, amount - allocatedTotal)
  });
  res.status(201).json({ payment, plan, advanceCredit: plan.advanceCredit });
};


// v3.37: Persisted voucher register + printable/reprintable voucher details.
exports.listFeeVouchers = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const q = { collegeId };
  if (req.query.status) q.status = req.query.status;
  if (req.query.batchNo) q.batchNo = String(req.query.batchNo).trim();
  const rows = await FeePosting.find(q)
    .populate({
      path: 'admissionApplicationId',
      select: 'studentName fatherName formNo rollNo programId academicSessionId',
      populate: [
        { path: 'programId', select: 'name code' },
        { path: 'academicSessionId', select: 'name' }
      ]
    })
    .populate('postedBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(500);
  res.json(rows);
};

exports.getFeeVoucher = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const posting = await FeePosting.findOne({ _id: req.params.id, collegeId })
    .populate({
      path: 'admissionApplicationId',
      select: 'studentName fatherName formNo rollNo contactNo address programId academicSessionId periodNumber',
      populate: [
        { path: 'programId', select: 'name code' },
        { path: 'academicSessionId', select: 'name' }
      ]
    })
    .populate('studentFeePlanId', 'packageLines totalAmount totalPaid advanceCredit billingCycle enrollmentKey')
    .populate('postedBy', 'name email');
  if (!posting) throw Object.assign(new Error('Fee voucher not found'), { status: 404 });

  let college = null;
  try {
    const College = require('../../models/College');
    college = await College.findById(collegeId).select('name displayName shortName address phone phoneNumber email website logo logoUrl').lean();
  } catch (_) {}

  const currentOpenLines = await openPostingLines(posting.studentFeePlanId?._id || posting.studentFeePlanId, collegeId);
  const postingOpen = currentOpenLines.filter(x => String(x.postingId) === String(posting._id));
  const outstandingAmount = Number(postingOpen.reduce((sum, x) => sum + Number(x.outstandingAmount || 0), 0).toFixed(2));

  res.json({ posting, college, systemHeads: SYSTEM_FEE_HEADS, outstandingAmount });
};

// v3.49: printable fee reports generated from actual postings/payments.
exports.getFeeReport = async (req, res) => {
  const collegeId = collegeIdOf(req);
  const type = String(req.params.type || '').trim().toLowerCase();
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  const cutoff = req.query.cutoff ? new Date(req.query.cutoff) : (to || new Date());
  const programId = String(req.query.programId || '').trim();
  const academicSessionId = String(req.query.academicSessionId || '').trim();
  const status = String(req.query.status || '').trim();
  const feeHeadCode = String(req.query.feeHeadCode || '').trim().toUpperCase();

  const inRange = (field) => {
    const q = {};
    if (from && !Number.isNaN(from.getTime())) q.$gte = from;
    if (to && !Number.isNaN(to.getTime())) { const d = new Date(to); d.setHours(23,59,59,999); q.$lte = d; }
    return Object.keys(q).length ? { [field]: q } : {};
  };

  const admissionMatch = {};
  if (programId) admissionMatch.programId = programId;
  if (academicSessionId) admissionMatch.academicSessionId = academicSessionId;
  const allowedAdmissions = (programId || academicSessionId)
    ? await AdmissionApplication.find({ collegeId, ...admissionMatch }).select('_id')
    : null;
  const admissionIds = allowedAdmissions ? allowedAdmissions.map(x => x._id) : null;

  if (type === 'defaulters' || type === 'outstanding-dues') {
    const planQ = { collegeId };
    if (admissionIds) planQ.admissionApplicationId = { $in: admissionIds };
    const plans = await StudentFeePlan.find(planQ)
      .populate({ path:'admissionApplicationId', select:'studentName fatherName rollNo formNo programId academicSessionId status', populate:[{path:'programId',select:'name code'},{path:'academicSessionId',select:'name'}] });
    const rows = [];
    for (const plan of plans) {
      if (!plan.admissionApplicationId) continue;
      const lines = await openPostingLines(plan._id, collegeId);
      const dueLines = lines.filter(line => {
        if (!line.dueDate) return true;
        const d = new Date(line.dueDate);
        return Number.isNaN(d.getTime()) || d <= cutoff;
      });
      const outstanding = Number(dueLines.reduce((sum,x)=>sum+Number(x.outstandingAmount||0),0).toFixed(2));
      if (outstanding <= 0) continue;
      const postedDue = Number(dueLines.reduce((sum,x)=>sum+Number(x.amount||0),0).toFixed(2));
      const paid = Number((postedDue - outstanding).toFixed(2));
      const a = plan.admissionApplicationId;
      rows.push({ rollNo:a.rollNo||a.formNo||'', studentName:a.studentName||'', fatherName:a.fatherName||'', program:a.programId?.name||'', session:a.academicSessionId?.name||'', totalDue:postedDue, paid, outstanding, status:a.status||'' });
    }
    rows.sort((a,b)=>b.outstanding-a.outstanding);
    return res.json({ type, title:type==='defaulters'?'Fee Defaulters':'Outstanding Dues', generatedAt:new Date(), cutoff, rows });
  }

  if (type === 'collections') {
    const q = { collegeId, isReversed:false, ...inRange('paymentDate') };
    if (admissionIds) q.admissionApplicationId = { $in: admissionIds };
    const payments = await FeePayment.find(q)
      .populate({ path:'admissionApplicationId', select:'studentName fatherName rollNo formNo programId academicSessionId', populate:[{path:'programId',select:'name code'},{path:'academicSessionId',select:'name'}] })
      .populate('postedBy','name email').sort({paymentDate:-1});
    const rows = payments.map(p=>({ receiptNo:p.receiptNo||'', challanNo:p.challanNo||p.referenceNo||'', date:p.paymentDate, rollNo:p.admissionApplicationId?.rollNo||p.admissionApplicationId?.formNo||'', studentName:p.admissionApplicationId?.studentName||'', program:p.admissionApplicationId?.programId?.name||'', amount:Number(p.amount||0), method:p.paymentMethod||'', postedBy:p.postedBy?.name||'' }));
    return res.json({ type, title:'Fee Collection', generatedAt:new Date(), rows, total:Number(rows.reduce((s,x)=>s+x.amount,0).toFixed(2)) });
  }

  if (type === 'voucher-status') {
    const q = { collegeId, ...inRange('postingDate') };
    if (admissionIds) q.admissionApplicationId = { $in: admissionIds };
    if (status) q.status = status;
    const postings = await FeePosting.find(q)
      .populate({ path:'admissionApplicationId', select:'studentName rollNo formNo programId academicSessionId', populate:[{path:'programId',select:'name code'},{path:'academicSessionId',select:'name'}] }).sort({createdAt:-1});
    const rows = postings.map(p=>({ voucherNo:p.voucherNo||'', type:p.voucherType||'bank', date:p.postingDate||p.createdAt, dueDate:p.dueDate, rollNo:p.admissionApplicationId?.rollNo||p.admissionApplicationId?.formNo||'', studentName:p.admissionApplicationId?.studentName||'', program:p.admissionApplicationId?.programId?.name||'', amount:Number(p.voucherAmount||0), status:p.status||'' }));
    return res.json({ type, title:'Voucher Status', generatedAt:new Date(), rows });
  }

  if (type === 'fee-head-collection') {
    const q = { collegeId, isReversed:false, ...inRange('paymentDate') };
    if (admissionIds) q.admissionApplicationId = { $in: admissionIds };
    const payments = await FeePayment.find(q).lean();
    const totals = new Map();
    for (const p of payments) {
      for (const a of (p.allocations||[])) {
        const code=String(a.feeHeadCode||'').toUpperCase();
        if (!code || (feeHeadCode && code!==feeHeadCode)) continue;
        totals.set(code, Number((Number(totals.get(code)||0)+Number(a.amount||0)).toFixed(2)));
      }
    }
    const map=systemHeadMap();
    const rows=[...totals.entries()].map(([code,amount])=>({ feeHeadCode:code, feeHead:map.get(code)?.name||code, amount })).sort((a,b)=>b.amount-a.amount);
    return res.json({ type, title:'Fee Head Collection', generatedAt:new Date(), rows, total:Number(rows.reduce((s,x)=>s+x.amount,0).toFixed(2)) });
  }

  throw Object.assign(new Error('Unsupported fee report type.'), { status:400 });
};

