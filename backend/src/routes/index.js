const router = require('express').Router();

const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const passwordChangeRequired = require('../middleware/passwordChangeRequired');

// --------------------------------------
// PUBLIC ROUTES
// --------------------------------------

router.use('/auth', require('../modules/auth/routes'));

router.use('/colleges', require('../modules/colleges/routes'));

// Public tenant/domain resolver
router.use('/tenant', require('../modules/tenantPublic/routes'));

// Biometric device ingestion uses device authentication,
// not a normal user JWT
router.post(
  '/biometric/ingest/:serial',
  require('../modules/biometric/controller').ingest
);


// --------------------------------------
// AUTHENTICATED ROUTES
// --------------------------------------

router.use(auth, tenant, passwordChangeRequired);

router.use('/users', require('../modules/users/routes'));
router.use('/roles', require('../modules/roles/routes'));
router.use('/college-profile', require('../modules/collegeProfile/routes'));

router.use('/wings', require('../modules/wings/routes'));
router.use('/academics', require('../modules/academics/routes'));
router.use('/admissions', require('../modules/admissions/routes'));
router.use('/students', require('../modules/students/routes'));

// Feedback endpoints must remain reachable while a mandatory survey is pending.
router.use('/portal/feedback', require('../modules/feedback/portalRoutes'));
// Mobile/self-service portal. Mandatory feedback gates normal portal APIs.
router.use('/portal', require('../modules/feedback/controller').enforceMandatory, require('../modules/portal/routes'));
router.use('/employees', require('../modules/employees/routes'));
router.use('/designations', require('../modules/designations/routes'));

router.use('/attendance', require('../modules/attendance/routes'));
router.use('/timetable', require('../modules/timetable/routes'));
router.use('/biometric', require('../modules/biometric/routes'));

router.use('/fees', require('../modules/fees/routes'));
router.use('/finance', require('../modules/finance/routes'));
router.use('/exams', require('../modules/exams/routes'));

router.use('/library', require('../modules/library/routes'));
router.use('/transport', require('../modules/transport/routes'));
router.use('/hostel', require('../modules/hostel/routes'));
router.use('/payroll', require('../modules/payroll/routes'));

router.use('/events', require('../modules/events/routes'));
router.use('/isa', require('../modules/isa/routes'));
router.use('/notices', require('../modules/notices/routes'));
router.use('/feedback', require('../modules/feedback/routes'));

router.use('/reports', require('../modules/reports/routes'));
router.use('/analytics', require('../modules/analytics/routes'));
router.use('/audit', require('../modules/audit/routes'));

router.use(
  '/academic-reports',
  require('../modules/academicReports/routes')
);

router.use(
  '/documents',
  require('../modules/documents/routes')
);

// Platform Owner administration.
// Authentication is required.
router.use('/platform', require('../modules/platform/routes'));

module.exports = router;
