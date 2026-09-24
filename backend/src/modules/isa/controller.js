const { collegeIdFromRequest: cid, sendError: bad } = require('../../utils/request');
const ISARecord=require('../../models/ISARecord');
const Student=require('../../models/Student');
const {audit}=require('../../services/auditService');

function has(user,p){return user?.systemRole==='platform_owner'||(user?.effectivePermissions||[]).includes('*')||(user?.effectivePermissions||[]).includes(p)}

async function listRecords(req,res){
  const q={collegeId:cid(req)};
  if(req.query.status)q.status=req.query.status;
  if(req.query.studentId)q.studentId=req.query.studentId;
  if(req.user?.linkedStudentId && !has(req.user,'VIEW_ISA_REPORTS')){
    q.studentId=req.user.linkedStudentId;
    q.confidential=false;
  }
  res.json(await ISARecord.find(q)
    .populate('studentId','name admissionNo registrationNo')
    .populate('assignedToEmployeeId','name employeeNo')
    .sort({createdAt:-1}));
}
async function createRecord(req,res){
  const collegeId=cid(req);
  const student=await Student.findOne({_id:req.body.studentId,collegeId});
  if(!student)return bad(res,'Invalid student');
  const doc=await ISARecord.create({...req.body,collegeId,createdBy:req.user._id});
  await audit(req,'CREATE_ISA_RECORD','ISARecord',doc._id,{studentId:student._id});
  res.status(201).json(doc);
}
async function updateRecord(req,res){
  const doc=await ISARecord.findOne({_id:req.params.id,collegeId:cid(req)});
  if(!doc)return bad(res,'ISA record not found',404);
  Object.assign(doc,req.body);
  if(['resolved','closed'].includes(doc.status)&&!doc.resolvedAt)doc.resolvedAt=new Date();
  await doc.save();
  await audit(req,'UPDATE_ISA_RECORD','ISARecord',doc._id,{status:doc.status});
  res.json(doc);
}
async function myRecords(req,res){
  if(!req.user?.linkedStudentId)return bad(res,'Student account required',403);
  res.json(await ISARecord.find({collegeId:cid(req),studentId:req.user.linkedStudentId,confidential:false})
    .sort({createdAt:-1}));
}
module.exports={listRecords,createRecord,updateRecord,myRecords};
