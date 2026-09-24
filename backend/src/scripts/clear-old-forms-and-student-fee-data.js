require('dotenv').config();
const mongoose = require('mongoose');

const YES = '--yes';

function argValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((x) => x.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : '';
}

function oid(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) return null;
  return new mongoose.Types.ObjectId(String(value));
}

async function collectionExists(db, name) {
  const rows = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return rows.length > 0;
}

async function deleteScoped(db, name, filter) {
  if (!(await collectionExists(db, name))) {
    console.log(`${name}: collection not present (skipped)`);
    return 0;
  }
  const result = await db.collection(name).deleteMany(filter);
  console.log(`${name}: deleted ${result.deletedCount}`);
  return result.deletedCount;
}

async function dropSecondaryIndexes(db, name) {
  if (!(await collectionExists(db, name))) return;
  const collection = db.collection(name);
  const indexes = await collection.indexes();
  const secondary = indexes.filter((x) => x.name !== '_id_');
  if (!secondary.length) {
    console.log(`${name}: no secondary indexes to clear`);
    return;
  }
  for (const index of secondary) {
    try {
      await collection.dropIndex(index.name);
      console.log(`${name}: dropped index ${index.name}`);
    } catch (err) {
      if (err?.codeName === 'IndexNotFound' || err?.code === 27) continue;
      throw err;
    }
  }
}

async function resolveCollege(db) {
  const requestedId = argValue('college-id');
  const requestedName = argValue('college');
  const envCollegeId = String(process.env.LOCAL_DEV_COLLEGE_ID || '').trim();

  // Explicit command-line selection is authoritative.
  if (requestedId) {
    const _id = oid(requestedId);
    if (!_id) throw new Error(`Invalid college id: ${requestedId}`);
    const college = await db.collection('colleges').findOne({ _id });
    if (!college) throw new Error(`College not found for id ${requestedId}`);
    return college;
  }

  if (requestedName) {
    const college = await db.collection('colleges').findOne({ name: requestedName });
    if (!college) throw new Error(`College not found with exact name: ${requestedName}`);
    return college;
  }

  // LOCAL_DEV_COLLEGE_ID is only a convenience hint. A stale value in .env
  // must not block a reset when this database contains exactly one college.
  if (envCollegeId) {
    const _id = oid(envCollegeId);
    if (_id) {
      const college = await db.collection('colleges').findOne({ _id });
      if (college) return college;
    }
    console.warn(`Warning: LOCAL_DEV_COLLEGE_ID (${envCollegeId}) does not match a current college; falling back to database discovery.`);
  }

  const colleges = await db.collection('colleges').find({}).project({ name: 1 }).toArray();
  if (colleges.length === 1) return colleges[0];
  if (colleges.length === 0) throw new Error('No college exists in this database.');

  throw new Error(
    'College is ambiguous. Run with --college-id=<id> or --college="Exact College Name".'
  );
}

async function rebuildCurrentModelIndexes() {
  // Rebuild indexes from the CURRENT project models. This intentionally removes
  // stale historical indexes (for example old AdmissionApplication indexes)
  // and recreates only what the current schemas declare.
  const models = [
    ['../models/Inquiry', 'Inquiry'],
    ['../models/AdmissionApplication', 'AdmissionApplication'],
    ['../models/Student', 'Student'],
    ['../models/StudentEnrollment', 'StudentEnrollment'],
    ['../models/StudentFeePlan', 'StudentFeePlan'],
    ['../models/FeeConcession', 'FeeConcession'],
    ['../models/FeeInvoice', 'FeeInvoice'],
    ['../models/FeePayment', 'FeePayment'],
    ['../models/FeePosting', 'FeePosting'],
    ['../models/Attendance', 'Attendance'],
    ['../models/AttendanceSession', 'AttendanceSession'],
    ['../models/ExamResult', 'ExamResult'],
    ['../models/HostelAssignment', 'HostelAssignment'],
    ['../models/TransportAssignment', 'TransportAssignment'],
    ['../models/ISARecord', 'ISARecord'],
  ];

  console.log('\nRebuilding indexes from current model definitions...');
  for (const [path, label] of models) {
    try {
      const Model = require(path);
      await Model.syncIndexes();
      console.log(`${label}: indexes synchronized`);
    } catch (err) {
      if (err?.code === 'MODULE_NOT_FOUND' && String(err.message || '').includes(path)) {
        console.log(`${label}: model not present (skipped)`);
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing from backend/.env');

  if (!process.argv.includes(YES)) {
    console.log('');
    console.log('============================================================');
    console.log(' OLD FORMS + STUDENT FEE DATA RESET - PREVIEW ONLY');
    console.log('============================================================');
    console.log('');
    console.log('This script clears ALL old student/admission operational data for ONE college.');
    console.log('');
    console.log('It CLEARS:');
    console.log('  - Inquiries and ALL submitted Admission Forms / Admission Applications');
    console.log('  - Students, enrollments and lifecycle records');
    console.log('  - Student Fee Details: fee plans, vouchers/postings, payments, concessions/invoices');
    console.log('  - Student attendance and exam results');
    console.log('  - Student hostel/transport assignments');
    console.log('  - Student ISA records');
    console.log('  - Student library reservations/issues only (employee library data stays)');
    console.log('  - Student event registrations only (employee registrations stay)');
    console.log('  - Student biometric identities/events only');
    console.log('  - Finance transactions automatically created from Fees only');
    console.log('  - Student login accounts linked to deleted students\n  - Student/admission/form/voucher/receipt numbering sequences');
    console.log('  - Secondary indexes on fully-cleared student collections, then rebuilds');
    console.log('    indexes from the CURRENT model schemas.');
    console.log('');
    console.log('It PRESERVES:');
    console.log('  - College profile and branches/wings');
    console.log('  - Academic sessions, programs/classes, sections, subjects/courses');
    console.log('  - Fee heads, fee structures and reusable fee packages (master setup only)');
    console.log('  - Employees, designations, payroll, staff attendance');
    console.log('  - Library books/copies/settings');
    console.log('  - Transport routes/vehicles and Hostel rooms/plans');
    console.log('  - Finance accounts/heads and non-fee finance transactions');
    console.log('  - Users, roles and permissions');
    console.log('');
    console.log('Run after taking a backup:');
    console.log('  node src/scripts/clear-student-operational-data.js --yes');
    console.log('or explicitly:');
    console.log('  node src/scripts/clear-student-operational-data.js --yes --college-id=<id>');
    console.log('');
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const college = await resolveCollege(db);
  const collegeId = college._id;

  console.log('Connected to:', db.databaseName);
  console.log('Target college:', college.name || college._id.toString());
  console.log('College ID:', college._id.toString());
  console.log('');

  // Capture student biometric identifiers before deleting identities.
  let studentBiometricUserIds = [];
  if (await collectionExists(db, 'biometricidentities')) {
    studentBiometricUserIds = await db.collection('biometricidentities')
      .distinct('biometricUserId', { collegeId, personType: 'student' });
  }

  // Fully student-scoped collections: clear all rows for this college.
  const fullStudentCollections = [
    'inquiries',
    'admissionapplications',
    'students',
    'studentenrollments',
    'studentlifecycleevents',
    'studentfeeplans',
    'feeconcessions',
    'feeinvoices',
    'feepayments',
    'feepostings',
    'attendances',
    'attendancesessions',
    'examresults',
    'hostelassignments',
    'transportassignments',
    'isarecords',
  ];

  console.log('Deleting student operational records...');
  for (const name of fullStudentCollections) {
    await deleteScoped(db, name, { collegeId });
  }

  // Mixed collections: preserve employee/staff records.
  await deleteScoped(db, 'libraryissues', { collegeId, studentId: { $exists: true, $ne: null } });
  await deleteScoped(db, 'libraryreservations', { collegeId, studentId: { $exists: true, $ne: null } });
  await deleteScoped(db, 'eventregistrations', { collegeId, studentId: { $exists: true, $ne: null } });
  await deleteScoped(db, 'biometricidentities', { collegeId, personType: 'student' });

  if (studentBiometricUserIds.length) {
    await deleteScoped(db, 'biometricevents', { collegeId, biometricUserId: { $in: studentBiometricUserIds } });
  } else {
    console.log('biometricevents: no student biometric identities found (skipped)');
  }

  // Remove only Finance entries generated from student fee payments.
  // Manual/non-fee finance history is intentionally preserved.
  await deleteScoped(db, 'financetransactions', { collegeId, sourceModule: 'fees' });

  // Remove student login accounts linked to deleted students. Staff/Director users stay.
  await deleteScoped(db, 'users', {
    collegeId,
    linkedStudentId: { $exists: true, $ne: null }
  });

  // Remove notifications whose entity points to the student-domain objects that are being cleared.
  // Do NOT remove general/staff notifications.
  await deleteScoped(db, 'notifications', {
    collegeId,
    entityType: {
      $in: [
        'Inquiry', 'AdmissionApplication', 'Student', 'StudentEnrollment',
        'StudentFeePlan', 'FeePayment', 'FeePosting', 'Attendance', 'ExamResult'
      ]
    }
  });

  // Reset only student/admission/fee number generators. Academic/employee/finance
  // sequences are intentionally preserved.
  if (await collectionExists(db, 'sequences')) {
    const seqResult = await db.collection('sequences').deleteMany({
      collegeId,
      $or: [
        { key: /^inquiry-/ },
        { key: /^admission-form-/ },
        { key: /^admission-application-/ },
        { key: /^student-admission-/ },
        { key: /^student-registration-/ },
        { key: /^student-roll:/ },
        { key: /^fee-receipt-/ },
        { key: /^fee-voucher-/ },
        { key: /^fee-voucher-batch-/ },
      ]
    });
    console.log(`sequences: deleted ${seqResult.deletedCount} student/admission/fee counters`);
  }

  // Clear secondary indexes only on collections whose college-scoped data was
  // fully cleared, then recreate indexes from the current model definitions.
  console.log('\nClearing stale indexes on student collections...');
  for (const name of fullStudentCollections) {
    await dropSecondaryIndexes(db, name);
  }

  await rebuildCurrentModelIndexes();

  console.log('');
  console.log('============================================================');
  console.log(' OLD FORMS + STUDENT FEE DATA RESET COMPLETE');
  console.log('============================================================');
  console.log('College and academic master information were NOT removed.');
  console.log('Restart the backend before testing new inquiries/admissions.');
}

main()
  .catch((err) => {
    console.error('\nReset failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
