const r=require('express').Router();
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');
const c=require('./controller');

r.get('/executive',permit(P.VIEW_ANALYTICS),c.executiveDashboard);
r.get('/module/:module',permit(P.VIEW_ANALYTICS),c.moduleSummary);
r.get('/saved-reports',permit(P.VIEW_ANALYTICS),c.listSavedReports);
r.post('/saved-reports',permit(P.VIEW_ANALYTICS),c.saveReport);
r.delete('/saved-reports/:id',permit(P.VIEW_ANALYTICS),c.deleteSavedReport);
module.exports=r;
