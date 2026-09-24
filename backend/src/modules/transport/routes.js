const r=require('express').Router();
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');
const c=require('./controller');

r.get('/dashboard',permit(P.VIEW_TRANSPORT),c.dashboard);
r.get('/lookups',permit(P.VIEW_TRANSPORT),c.lookups);

r.get('/vehicles',permit(P.VIEW_TRANSPORT),c.listVehicles);
r.post('/vehicles',permit(P.MANAGE_TRANSPORT_VEHICLES),c.createVehicle);
r.put('/vehicles/:id',permit(P.MANAGE_TRANSPORT_VEHICLES),c.updateVehicle);

r.get('/routes',permit(P.VIEW_TRANSPORT),c.listRoutes);
r.post('/routes',permit(P.MANAGE_TRANSPORT_ROUTES),c.createRoute);
r.put('/routes/:id',permit(P.MANAGE_TRANSPORT_ROUTES),c.updateRoute);

r.get('/assignments',permit(P.VIEW_TRANSPORT),c.listAssignments);
r.post('/assignments',permit(P.MANAGE_TRANSPORT_ASSIGNMENTS),c.assignStudent);
r.post('/assignments/:id/end',permit(P.MANAGE_TRANSPORT_ASSIGNMENTS),c.endAssignment);

r.get('/maintenance',permit(P.VIEW_TRANSPORT),c.listMaintenance);
r.post('/maintenance',permit(P.MANAGE_TRANSPORT_MAINTENANCE),c.addMaintenance);

r.get('/reports',permit(P.VIEW_TRANSPORT_REPORTS),c.report);
r.get('/settings',permit(P.VIEW_TRANSPORT),c.getSettings);
r.put('/settings',permit(P.MANAGE_TRANSPORT),c.saveSettings);
r.get('/my-transport',permit(P.VIEW_TRANSPORT),c.studentMyTransport);

module.exports=r;
