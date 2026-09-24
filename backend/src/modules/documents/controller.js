const { collegeIdFromRequest: cid, sendError: bad } = require('../../utils/request');
const Exam=require('../../models/Exam');
const ExamResult=require('../../models/ExamResult');
const Student=require('../../models/Student');
const College=require('../../models/College');
const {buildStudentProgress}=require('../../services/studentProgressService');

function same(a,b){return String(a||'')===String(b||'')}

async function reportCard(req,res){
  const collegeId=cid(req),studentId=req.params.studentId,examId=req.params.examId;
  if(req.user?.linkedStudentId && !same(req.user.linkedStudentId,studentId))return bad(res,'Access denied',403);
  const [college,student,exam,results]=await Promise.all([
    College.findById(collegeId).lean(),
    Student.findOne({_id:studentId,collegeId}).populate('programId sectionId academicSessionId').lean(),
    Exam.findOne({_id:examId,collegeId}).lean(),
    ExamResult.find({collegeId,studentId,examId,publishedAt:{$ne:null}}).populate('courseId','name code creditHours').lean()
  ]);
  if(!student||!exam)return bad(res,'Student or exam not found',404);
  const total=results.reduce((s,x)=>s+Number(x.totalMarks||0),0);
  const obtained=results.reduce((s,x)=>s+Number(x.marksObtained||0),0);
  const credits=results.reduce((s,x)=>s+Number(x.courseId?.creditHours||0),0);
  const quality=results.reduce((s,x)=>s+Number(x.gradePoint||0)*Number(x.courseId?.creditHours||0),0);
  res.json({
    documentType:'REPORT_CARD',
    college:{name:college?.name,logo:college?.branding?.logo,address:college?.address},
    student,exam,results,
    summary:{totalMarks:total,obtainedMarks:obtained,percentage:total?Number((obtained/total*100).toFixed(2)):0,gpa:credits?Number((quality/credits).toFixed(2)):0}
  });
}

async function studentProfileReport(req,res){
  if(req.user?.linkedStudentId && !same(req.user.linkedStudentId,req.params.studentId))return bad(res,'Access denied',403);
  const college=await College.findById(cid(req)).lean();
  const progress=await buildStudentProgress(cid(req),req.params.studentId);
  if(!progress)return bad(res,'Student not found',404);
  res.json({documentType:'STUDENT_PROGRESS_REPORT',college:{name:college?.name,branding:college?.branding},...progress});
}

module.exports={reportCard,studentProfileReport};
