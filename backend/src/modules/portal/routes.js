const router = require('express').Router();
const c = require('./controller');
const asyncHandler = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(err => {
  if(err?.code==='STUDENT_SUSPENDED')return res.status(403).json({error:err.message,code:err.code,portalAccess:err.portalAccess});
  if(err?.code==='STUDENT_INACTIVE')return res.status(403).json({error:err.message,code:err.code});
  if(String(err?.code||'').startsWith('TEACHER_'))return res.status(Number(err.status||403)).json({error:err.message,code:err.code});
  next(err);
});
router.get('/me',asyncHandler(c.me));
router.get('/student/profile',asyncHandler(c.studentProfile));
router.get('/student/attendance',asyncHandler(c.studentAttendance));
router.get('/student/timetable',asyncHandler(c.studentTimetable));
router.get('/student/fees',asyncHandler(c.studentFees));
router.get('/student/results',asyncHandler(c.studentResults));
router.get('/student/library',asyncHandler(c.studentLibrary));
router.get('/student/library/catalog',asyncHandler(c.studentLibraryCatalog));
router.get('/student/notices',asyncHandler(c.studentNotices));
router.post('/student/notices/:id/read',asyncHandler(c.markStudentNoticeRead));
router.get('/student/events',asyncHandler(c.studentEvents));
router.post('/student/events/:id/register',asyncHandler(c.registerStudentEvent));

router.get('/teacher/profile',asyncHandler(c.teacherProfile));
router.get('/teacher/dashboard',asyncHandler(c.teacherDashboard));
router.get('/teacher/timetable',asyncHandler(c.teacherTimetable));
router.get('/teacher/classes',asyncHandler(c.teacherClasses));
router.get('/teacher/classes/:assignmentId/students',asyncHandler(c.teacherClassStudents));
router.get('/teacher/attendance/contexts',asyncHandler(c.teacherAttendanceContexts));
router.get('/teacher/attendance/roster',asyncHandler(c.teacherAttendanceRoster));
router.post('/teacher/attendance/submit',asyncHandler(c.teacherSubmitAttendance));
router.get('/teacher/marks/papers',asyncHandler(c.teacherMarksPapers));
router.get('/teacher/marks/:scheduleId',asyncHandler(c.teacherMarksRoster));
router.post('/teacher/marks/:scheduleId',asyncHandler(c.teacherSaveMarks));


router.post('/push/register',asyncHandler(c.registerPushToken));
router.post('/push/unregister',asyncHandler(c.unregisterPushToken));

module.exports=router;
