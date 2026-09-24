const r=require('express').Router();
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');
const c=require('./controller');

// Platform routes are platform-owner only. A tenant Director may have wildcard
// permissions, but must never be able to enter cross-tenant provisioning.
r.use((req,res,next)=>req.isPlatformOwner?next():res.status(403).json({error:'Platform Owner access required'}));

r.get('/dashboard',permit(P.VIEW_PLATFORM_ANALYTICS),c.platformDashboard);
r.get('/colleges',permit(P.MANAGE_TENANTS),c.listColleges);
r.post('/colleges',permit(P.MANAGE_TENANTS),c.createCollege);
r.put('/colleges/:id',permit(P.MANAGE_TENANTS),c.updateCollege);
r.post('/colleges/:id/suspend',permit(P.MANAGE_TENANTS),c.suspendCollege);
r.post('/colleges/:id/reactivate',permit(P.MANAGE_TENANTS),c.reactivateCollege);

r.get('/colleges/:collegeId/structure',permit(P.MANAGE_TENANTS),c.getCollegeStructure);
r.post('/colleges/:collegeId/directors',permit(P.MANAGE_TENANTS),c.createDirector);
r.put('/colleges/:collegeId/directors/:userId',permit(P.MANAGE_TENANTS),c.updateDirector);
r.post('/colleges/:collegeId/directors/:userId/reset-password',permit(P.MANAGE_TENANTS),c.resetDirectorPassword);

r.get('/plans',permit(P.MANAGE_SUBSCRIPTIONS),c.listPlans);
r.post('/plans',permit(P.MANAGE_SUBSCRIPTIONS),c.createPlan);
r.put('/plans/:id',permit(P.MANAGE_SUBSCRIPTIONS),c.updatePlan);
r.put('/colleges/:collegeId/subscription',permit(P.MANAGE_SUBSCRIPTIONS),c.assignSubscription);
r.get('/colleges/:collegeId/modules',permit(P.MANAGE_TENANT_MODULES),c.moduleConfig);
r.put('/colleges/:collegeId/modules',permit(P.MANAGE_TENANT_MODULES),c.updateModuleConfig);
r.post('/colleges/:collegeId/domains',permit(P.MANAGE_DOMAINS),c.startDomainVerification);
r.post('/domains/:id/verify',permit(P.MANAGE_DOMAINS),c.markDomainVerified);

module.exports=r;
