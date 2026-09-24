const r=require('express').Router();
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');
const c=require('./controller');

r.get('/report-card/:examId/:studentId',permit(P.VIEW_REPORTS),c.reportCard);
r.get('/student-progress/:studentId',permit(P.VIEW_REPORTS),c.studentProfileReport);
module.exports=r;
