const r = require('express').Router();
const c = require('./controller');
const permit = require('../../middleware/permissions');
const P = require('../../constants/permissions');
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);


function attendanceRoles(req){
  return new Set([
    ...(req.user?.roleCodes||[]),
    ...(req.user?.roles||[]).map(role=>role?.code||role?.name),
    req.user?.roleCode,
    req.user?.role,
    req.user?.designation
  ].filter(Boolean).map(code=>String(code).trim().toLowerCase()));
}
function attendancePermissions(req){
  return new Set([...(req.user?.permissions||[]),...(req.user?.effectivePermissions||[])]);
}
function isAttendanceAdmin(req){
  if(String(req.user?.systemRole||'').toLowerCase()==='platform_owner')return true;
  const roles=attendanceRoles(req);
  return roles.has('director')||roles.has('principal')||roles.has('admin');
}


function markAccess(req,res,next){
  if(isAttendanceAdmin(req))return next();
  const perms=attendancePermissions(req);
  if(perms.has('*')||perms.has(P.MARK_ATTENDANCE))return next();
  return res.status(403).json({error:'Attendance marking permission denied'});
}

function correctionAccess(req,res,next){
  if(isAttendanceAdmin(req))return next();
  const perms=attendancePermissions(req);
  if(perms.has('*')||perms.has(P.CORRECT_ATTENDANCE))return next();
  return res.status(403).json({error:'Attendance correction permission denied'});
}

function settingsAccess(req,res,next){
  // Director, Principal and Admin always manage Attendance Settings.
  // Every other college member requires an explicit effective permission.
  if(isAttendanceAdmin(req))return next();
  const perms=attendancePermissions(req);
  if(perms.has('*')||perms.has(P.CORRECT_ATTENDANCE)||perms.has(P.MANAGE_COLLEGE))return next();
  return res.status(403).json({error:'Attendance Settings permission denied'});
}

r.get('/contexts', permit(P.VIEW_ATTENDANCE), asyncHandler(c.contexts));
r.get('/context-roster', permit(P.VIEW_ATTENDANCE), asyncHandler(c.rosterContext));
r.post('/context/open', markAccess, asyncHandler(c.openContext));
r.post('/context/mark', markAccess, asyncHandler(c.markContext));
r.post('/context/finalize', markAccess, asyncHandler(c.finalizeContext));
r.post('/context/cancel', correctionAccess, asyncHandler(c.cancelContext));

r.get('/reports/student', permit(P.VIEW_ATTENDANCE), asyncHandler(c.studentReport));
r.get('/reports/staff', permit(P.VIEW_ATTENDANCE), asyncHandler(c.staffReport));

r.get('/rules', settingsAccess, asyncHandler(c.rules));
r.get('/settings-options', settingsAccess, asyncHandler(c.settingsOptions));
r.post('/rules', settingsAccess, asyncHandler(c.saveRule));
r.get('/staff-shifts', settingsAccess, asyncHandler(c.staffShifts));
r.post('/staff-shifts', settingsAccess, asyncHandler(c.saveStaffShift));
r.get('/staff-shift-assignments', settingsAccess, asyncHandler(c.staffShiftAssignments));
r.put('/staff-shift-assignments', settingsAccess, asyncHandler(c.saveStaffShiftAssignment));
r.get('/class-teachers', settingsAccess, asyncHandler(c.classTeachers));
r.put('/class-teachers/:sectionId', settingsAccess, asyncHandler(c.assignClassTeacher));
r.get('/staff', correctionAccess, asyncHandler(c.staffList));
r.post('/staff', correctionAccess, asyncHandler(c.saveStaff));

r.get('/my-classes', permit(P.VIEW_ATTENDANCE), asyncHandler(c.myClasses));
r.get('/sessions', permit(P.VIEW_ATTENDANCE), asyncHandler(c.sessions));
r.get('/roster/:timetableId', permit(P.VIEW_ATTENDANCE), asyncHandler(c.roster));
r.post('/sessions/:timetableId/open', markAccess, asyncHandler(c.open));
r.post('/manual/:timetableId', markAccess, asyncHandler(c.markManual));
r.post('/sessions/:timetableId/finalize', markAccess, asyncHandler(c.finalize));
r.post('/sessions/:timetableId/cancel', correctionAccess, asyncHandler(c.cancel));
r.post('/sessions/auto-finalize', correctionAccess, asyncHandler(c.autoFinalize));
r.get('/calendar', settingsAccess, asyncHandler(c.calendarList));
r.post('/calendar', settingsAccess, asyncHandler(c.calendarCreate));
r.put('/calendar/:id', settingsAccess, asyncHandler(c.calendarUpdate));
r.get('/', permit(P.VIEW_ATTENDANCE), asyncHandler(c.list));
r.put('/:id/correct', correctionAccess, asyncHandler(c.correct));
module.exports = r;
