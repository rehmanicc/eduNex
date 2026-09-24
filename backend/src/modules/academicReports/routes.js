const r=require('express').Router();
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');
const c=require('./controller');

r.get('/my-progress',permit(P.VIEW_REPORTS),c.myProgress);
r.get('/student/:studentId/progress',permit(P.VIEW_REPORTS),c.studentProgress);
r.get('/sections/summary',permit(P.VIEW_ANALYTICS),c.classSummary);
r.get('/section/:sectionId/attendance',permit(P.VIEW_ANALYTICS),c.sectionAttendance);
r.get('/section/:sectionId/exams',permit(P.VIEW_ANALYTICS),c.sectionExamPerformance);
r.get('/section/:sectionId/fees',permit(P.VIEW_ANALYTICS),c.sectionFeeStatus);

module.exports=r;
