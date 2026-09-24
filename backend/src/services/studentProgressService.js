const Student=require('../models/Student');
const Attendance=require('../models/Attendance');
const ExamResult=require('../models/ExamResult');
const FeeInvoice=require('../models/FeeInvoice');
const FeePayment=require('../models/FeePayment');
const LibraryIssue=require('../models/LibraryIssue');
const TransportAssignment=require('../models/TransportAssignment');
const HostelAssignment=require('../models/HostelAssignment');

function n(v){return Number(v||0)}
function pct(a,b){return b?Number(((a/b)*100).toFixed(2)):0}

async function buildStudentProgress(collegeId, studentId){
  const student=await Student.findOne({_id:studentId,collegeId})
    .populate('programId','name code')
    .populate('sectionId','name code semester')
    .populate('academicSessionId','name')
    .lean();
  if(!student)return null;

  const [attendance,results,invoices,payments,library,transport,hostel]=await Promise.all([
    Attendance.find({collegeId,studentId}).lean(),
    ExamResult.find({collegeId,studentId,publishedAt:{$ne:null}})
      .populate('examId','name status publishedAt')
      .populate('courseId','name code creditHours semester')
      .lean(),
    FeeInvoice.find({collegeId,studentId}).lean(),
    FeePayment.find({collegeId,studentId,status:{$ne:'void'}}).lean().catch(()=>[]),
    LibraryIssue.find({collegeId,studentId,status:{$in:['issued','overdue']}}).populate('bookId','title').lean(),
    TransportAssignment.findOne({collegeId,studentId,status:'active'}).populate('routeId','name code').lean(),
    HostelAssignment.findOne({collegeId,studentId,status:'active'}).populate('hostelId','name code').populate('roomId','roomNo').lean()
  ]);

  const present=attendance.filter(x=>['present','late'].includes(x.status)).length;
  const absent=attendance.filter(x=>x.status==='absent').length;
  const totalAttendance=present+absent;

  const totalMarks=results.reduce((s,x)=>s+n(x.totalMarks),0);
  const obtainedMarks=results.reduce((s,x)=>s+n(x.marksObtained),0);
  const credits=results.reduce((s,x)=>s+n(x.courseId?.creditHours),0);
  const quality=results.reduce((s,x)=>s+n(x.gradePoint)*n(x.courseId?.creditHours),0);

  const billed=invoices.reduce((s,x)=>s+n(x.netPayable||x.totalAmount||x.amount),0);
  const paid=payments.reduce((s,x)=>s+n(x.amount),0);

  return {
    student,
    attendance:{
      total:totalAttendance,
      present,
      absent,
      late:attendance.filter(x=>x.status==='late').length,
      percentage:pct(present,totalAttendance)
    },
    academics:{
      publishedResults:results.length,
      totalMarks,
      obtainedMarks,
      percentage:pct(obtainedMarks,totalMarks),
      gpa:credits?Number((quality/credits).toFixed(2)):0,
      failedCourses:results.filter(x=>x.resultStatus==='fail').length,
      results
    },
    finance:{
      billed,
      paid,
      outstanding:Math.max(0,billed-paid),
      invoices:invoices.length,
      payments:payments.length
    },
    services:{
      libraryActiveIssues:library.length,
      libraryOverdue:library.filter(x=>x.status==='overdue').length,
      transport:transport||null,
      hostel:hostel||null
    }
  };
}

module.exports={buildStudentProgress};
