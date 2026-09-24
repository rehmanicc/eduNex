const r = require('express').Router();

const c = require('./controller');
const permit = require('../../middleware/permissions');
const P = require('../../constants/permissions');


// =========================================================
// ASYNC ERROR WRAPPER
// =========================================================

function asyncHandler(fn) {
  return function wrappedAsyncHandler(req, res, next) {
    Promise
      .resolve(fn(req, res, next))
      .catch(next);
  };
}


// =========================================================
// ALLOWED ACADEMIC RESOURCES
// =========================================================

const allowed = new Set([
  'sessions',
  'sessionPeriods',
  'departments',
  'programs',
  'courses',
  'sections'
]);


// =========================================================
// RESOURCE GUARD
// =========================================================

function resourceGuard(req, res, next) {
  if (!allowed.has(req.params.resource)) {
    return res.status(404).json({
      error: 'Academic resource not found'
    });
  }

  next();
}


// =========================================================
// TEACHER WORKLOAD
// Keep this route before /:resource so "teacher-workload"
// is not interpreted as an academic resource.
// =========================================================

r.get('/structure',permit(P.VIEW_ACADEMICS),asyncHandler(c.structure));


r.get(
  '/teacher-workload',
  permit(P.VIEW_ACADEMICS),
  asyncHandler(c.teacherWorkload)
);


// =========================================================
// SUBJECT MASTER / BULK CLASS SUBJECT ASSIGNMENT
// Keep these routes before /:resource.
// =========================================================

r.get(
  '/subjects',
  permit(P.VIEW_ACADEMICS),
  asyncHandler(c.subjects)
);

r.post(
  '/subjects',
  permit(P.MANAGE_ACADEMICS),
  asyncHandler(c.createSubject)
);

r.post(
  '/course-assignments/bulk',
  permit(P.MANAGE_ACADEMICS),
  asyncHandler(c.bulkAssignCourses)
);


// =========================================================
// LIST
// =========================================================

r.get(
  '/:resource',
  resourceGuard,
  permit(P.VIEW_ACADEMICS),
  asyncHandler(c.list)
);


// =========================================================
// GET ONE
// =========================================================

r.get(
  '/:resource/:id',
  resourceGuard,
  permit(P.VIEW_ACADEMICS),
  asyncHandler(c.get)
);


// =========================================================
// CREATE
// =========================================================

r.post(
  '/:resource',
  resourceGuard,
  permit(P.MANAGE_ACADEMICS),
  asyncHandler(c.create)
);


// =========================================================
// UPDATE
// =========================================================

r.put(
  '/:resource/:id',
  resourceGuard,
  permit(P.MANAGE_ACADEMICS),
  asyncHandler(c.update)
);


// =========================================================
// DELETE
// =========================================================

r.delete(
  '/:resource/:id',
  resourceGuard,
  permit(P.MANAGE_ACADEMICS),
  asyncHandler(c.remove)
);


module.exports = r;