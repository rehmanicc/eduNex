const { collegeIdFromRequest: cid, sendError: bad } = require('../../utils/request');
const Student=require('../../models/Student');
const Attendance=require('../../models/Attendance');
const ExamResult=require('../../models/ExamResult');
const FeeInvoice=require('../../models/FeeInvoice');
const FeePayment=require('../../models/FeePayment');
const Section=require('../../models/Section');
const {buildStudentProgress}=require('../../services/studentProgressService');

function id(v){return String(v?._id||v||'')}
function pct(a,b){return b?Number(((a/b)*100).toFixed(2)):0}
function ownStudent(req,studentId){
  return !req.user?.linkedStudentId || id(req.user.linkedStudentId)===id(studentId);
}

async function studentProgress(req,res){
  if(!ownStudent(req,req.params.studentId))return bad(res,'Access denied',403);
  const data=await buildStudentProgress(cid(req),req.params.studentId);
  if(!data)return bad(res,'Student not found',404);
  res.json(data);
}

async function myProgress(req,res){
  if(!req.user?.linkedStudentId)return bad(res,'Student account required',403);
  const data=await buildStudentProgress(cid(req),req.user.linkedStudentId);
  if(!data)return bad(res,'Student not found',404);
  res.json(data);
}

async function sectionAttendance(req,res){
  const collegeId=cid(req), sectionId=req.params.sectionId;
  const students=await Student.find({collegeId,sectionId,status:'active'}).select('_id name rollNo registrationNo').lean();
  const studentIds=students.map(x=>x._id);
  const rows=await Attendance.find({collegeId,studentId:{$in:studentIds}}).lean();
  const map=new Map();
  for(const s of students)map.set(id(s._id),{student:s,present:0,absent:0,late:0,total:0});
  for(const a of rows){
    const x=map.get(id(a.studentId)); if(!x)continue;
    if(a.status==='present')x.present++;
    if(a.status==='late'){x.late++;x.present++;}
    if(a.status==='absent')x.absent++;
    if(['present','late','absent'].includes(a.status))x.total++;
  }
  res.json([...map.values()].map(x=>({...x,percentage:pct(x.present,x.total)})));
}

async function sectionExamPerformance(req,res){
  const collegeId=cid(req), sectionId=req.params.sectionId;
  const rows=await ExamResult.find({collegeId,sectionId,publishedAt:{$ne:null}})
    .populate('studentId','name rollNo registrationNo')
    .populate('courseId','name code')
    .populate('examId','name')
    .lean();
  const byStudent={};
  rows.forEach(r=>{
    const key=id(r.studentId);
    if(!byStudent[key])byStudent[key]={student:r.studentId,totalMarks:0,obtained:0,subjects:0,failed:0};
    byStudent[key].totalMarks+=Number(r.totalMarks||0);
    byStudent[key].obtained+=Number(r.marksObtained||0);
    byStudent[key].subjects++;
    if(r.resultStatus==='fail')byStudent[key].failed++;
  });
  res.json(Object.values(byStudent).map(x=>({...x,percentage:pct(x.obtained,x.totalMarks)})).sort((a,b)=>b.percentage-a.percentage));
}

async function sectionFeeStatus(req,res){
  const collegeId=cid(req),sectionId=req.params.sectionId;
  const students=await Student.find({collegeId,sectionId,status:'active'}).select('_id name rollNo registrationNo').lean();
  const ids=students.map(x=>x._id);
  const [invoices,payments]=await Promise.all([
    FeeInvoice.find({collegeId,studentId:{$in:ids}}).lean(),
    FeePayment.find({collegeId,studentId:{$in:ids},status:{$ne:'void'}}).lean().catch(()=>[])
  ]);
  const map=new Map(students.map(s=>[id(s._id),{student:s,billed:0,paid:0}]));
  invoices.forEach(x=>{const r=map.get(id(x.studentId));if(r)r.billed+=Number(x.netPayable||x.totalAmount||x.amount||0)});
  payments.forEach(x=>{const r=map.get(id(x.studentId));if(r)r.paid+=Number(x.amount||0)});
  res.json([...map.values()].map(x=>({...x,outstanding:Math.max(0,x.billed-x.paid)})));
}

async function classSummary(req,res){
  const collegeId=cid(req);
  const sections=await Section.find({collegeId,isActive:{$ne:false}}).populate('programId','name code').lean();
  const results=[];
  for(const section of sections){
    const students=await Student.countDocuments({collegeId,sectionId:section._id,status:'active'});
    const attendance=await Attendance.find({collegeId,studentId:{$in:(await Student.find({collegeId,sectionId:section._id,status:'active'}).select('_id').lean()).map(x=>x._id)}}).lean();
    const counted=attendance.filter(x=>['present','late','absent'].includes(x.status));
    const present=counted.filter(x=>['present','late'].includes(x.status)).length;
    results.push({section,students,attendancePercentage:pct(present,counted.length)});
  }
  res.json(results);
}

module.exports={studentProgress,myProgress,sectionAttendance,sectionExamPerformance,sectionFeeStatus,classSummary};
