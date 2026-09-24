const r=require('express').Router();
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');
const c=require('./controller');
const asyncHandler=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);

r.get('/dashboard',permit(P.VIEW_HOSTEL),asyncHandler(c.dashboard));
r.get('/lookups',permit(P.VIEW_HOSTEL),asyncHandler(c.lookups));

r.get('/hostels',permit(P.VIEW_HOSTEL),asyncHandler(c.listHostels));
r.post('/hostels',permit(P.MANAGE_HOSTELS),asyncHandler(c.createHostel));
r.put('/hostels/:id',permit(P.MANAGE_HOSTELS),asyncHandler(c.updateHostel));

r.get('/rooms',permit(P.VIEW_HOSTEL),asyncHandler(c.listRooms));
r.post('/rooms',permit(P.MANAGE_HOSTEL_ROOMS),asyncHandler(c.createRoom));
r.put('/rooms/:id',permit(P.MANAGE_HOSTEL_ROOMS),asyncHandler(c.updateRoom));

r.get('/assignments',permit(P.VIEW_HOSTEL),asyncHandler(c.listAssignments));
r.post('/assignments',permit(P.MANAGE_HOSTEL_ALLOCATIONS),asyncHandler(c.allocateStudent));
r.post('/assignments/:id/check-out',permit(P.MANAGE_HOSTEL_ALLOCATIONS),asyncHandler(c.checkOut));

r.get('/fees',permit(P.VIEW_HOSTEL),asyncHandler(c.fees));

r.get('/attendance',permit(P.VIEW_HOSTEL),asyncHandler(c.listAttendance));
r.post('/attendance',permit(P.MANAGE_HOSTEL_ALLOCATIONS),asyncHandler(c.saveAttendance));

r.get('/visitors',permit(P.VIEW_HOSTEL),asyncHandler(c.listVisitors));
r.post('/visitors',permit(P.MANAGE_HOSTEL),asyncHandler(c.createVisitor));
r.post('/visitors/:id/check-out',permit(P.MANAGE_HOSTEL),asyncHandler(c.checkOutVisitor));

r.get('/complaints',permit(P.VIEW_HOSTEL),asyncHandler(c.listComplaints));
r.post('/complaints',permit(P.VIEW_HOSTEL),asyncHandler(c.createComplaint));
r.put('/complaints/:id',permit(P.MANAGE_HOSTEL_COMPLAINTS),asyncHandler(c.updateComplaint));

r.get('/reports',permit(P.VIEW_HOSTEL_REPORTS),asyncHandler(c.reports));
r.get('/settings',permit(P.VIEW_HOSTEL),asyncHandler(c.getSettings));
r.put('/settings',permit(P.MANAGE_HOSTEL),asyncHandler(c.updateSettings));
r.get('/my-hostel',permit(P.VIEW_HOSTEL),asyncHandler(c.myHostel));

module.exports=r;
