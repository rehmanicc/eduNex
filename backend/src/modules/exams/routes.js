const r=require('express').Router();
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');
const c=require('./controller');
const analytics=require('./analytics');

r.get('/types',permit(P.VIEW_EXAMS),c.listExamTypes);
r.post('/types',permit(P.MANAGE_EXAMS),c.createExamType);
r.put('/types/:id',permit(P.MANAGE_EXAMS),c.updateExamType);

r.get('/grading-schemes',permit(P.VIEW_EXAMS),c.listGradingSchemes);
r.post('/grading-schemes',permit(P.MANAGE_GRADING),c.createGradingScheme);
r.put('/grading-schemes/:id',permit(P.MANAGE_GRADING),c.updateGradingScheme);

r.get('/exams',permit(P.VIEW_EXAMS),c.listExams);
r.post('/exams',permit(P.MANAGE_EXAMS),c.createExam);
r.put('/exams/:id',permit(P.MANAGE_EXAMS),c.updateExam);
r.delete('/exams/:id',permit(P.MANAGE_EXAMS),c.deleteExam);

r.get('/schedules',permit(P.VIEW_EXAMS),c.listSchedules);
r.post('/schedules',permit(P.MANAGE_EXAMS),c.createSchedule);
r.post('/schedules/batch',permit(P.MANAGE_EXAMS),c.createSchedulesBatch);
r.put('/schedules/:id',permit(P.MANAGE_EXAMS),c.updateSchedule);
r.delete('/schedules/:id',permit(P.MANAGE_EXAMS),c.deleteSchedule);
r.post('/schedules/:id/publish',permit(P.MANAGE_EXAMS),c.publishSchedule);
r.post('/exams/:examId/publish-date-sheet',permit(P.MANAGE_EXAMS),c.publishDateSheet);

r.get('/schedules/:scheduleId/roster',permit(P.VIEW_EXAMS),c.roster);
// Teachers already have VIEW_EXAMS. The controller restricts teachers to their own active course/section assignments.
r.put('/schedules/:scheduleId/marks',permit(P.VIEW_EXAMS),c.saveMarks);
r.post('/schedules/:scheduleId/verify',permit(P.VERIFY_EXAM_MARKS),c.verifyMarks);
r.post('/schedules/:scheduleId/reopen',permit(P.VERIFY_EXAM_MARKS),c.reopenMarks);

r.post('/exams/:examId/compile',permit(P.VERIFY_EXAM_MARKS),c.compileExam);
r.post('/exams/:examId/publish-results',permit(P.PUBLISH_RESULTS),c.publishResults);

r.get('/analytics',permit(P.VIEW_EXAMS),analytics.analytics);
r.get('/results',permit(P.VIEW_EXAMS),c.listResults);
r.get('/result-card/:examId/:studentId',permit(P.VIEW_EXAMS),c.resultCard);
r.get('/transcript/:studentId',permit(P.VIEW_EXAMS),c.transcript);

module.exports=r;
