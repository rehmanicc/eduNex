require('dotenv').config();
const mongoose = require('mongoose');

const YES = '--yes';

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((x) => x.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : '';
}

function oid(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) return null;
  return new mongoose.Types.ObjectId(String(value));
}

async function collectionExists(db, name) {
  const rows = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return rows.length > 0;
}

async function deleteMany(db, name, filter) {
  if (!(await collectionExists(db, name))) {
    console.log(`${name}: collection not present (skipped)`);
    return 0;
  }
  const r = await db.collection(name).deleteMany(filter);
  console.log(`${name}: deleted ${r.deletedCount}`);
  return r.deletedCount;
}

async function updateMany(db, name, filter, update) {
  if (!(await collectionExists(db, name))) {
    console.log(`${name}: collection not present (skipped)`);
    return 0;
  }
  const r = await db.collection(name).updateMany(filter, update);
  console.log(`${name}: updated ${r.modifiedCount}`);
  return r.modifiedCount;
}

async function resolveCollege(db) {
  const requestedId = argValue('college-id');
  const requestedName = argValue('college');

  if (requestedId) {
    const _id = oid(requestedId);
    if (!_id) throw new Error(`Invalid college id: ${requestedId}`);
    const row = await db.collection('colleges').findOne({ _id });
    if (!row) throw new Error(`College not found for id ${requestedId}`);
    return row;
  }

  if (requestedName) {
    const row = await db.collection('colleges').findOne({ name: requestedName });
    if (!row) throw new Error(`College not found with exact name: ${requestedName}`);
    return row;
  }

  const rows = await db.collection('colleges').find({}).project({ name: 1 }).toArray();
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new Error('No college exists in this database.');

  throw new Error(
    'More than one college exists. Run with --college-id=<id> or --college="Exact College Name".'
  );
}

async function roleMapForCollege(db, collegeId) {
  const roles = await db.collection('roles').find({ collegeId }).toArray();
  return new Map(roles.map(r => [String(r._id), String(r.code || r.name || '').trim().toLowerCase()]));
}

function userRoleCodes(user, roleMap) {
  const codes = new Set();
  if (user.systemRole) codes.add(String(user.systemRole).trim().toLowerCase());
  for (const id of user.roleIds || []) {
    const code = roleMap.get(String(id));
    if (code) codes.add(code);
  }
  return codes;
}

async function teacherEmployeeIds(db, collegeId) {
  const teacherIds = new Set();

  // 1) Teacher-like designations.
  if (await collectionExists(db, 'designations')) {
    const teacherDesignations = await db.collection('designations').find({
      collegeId,
      normalizedName: {
        $in: [
          'teacher',
          'lecturer',
          'instructor',
          'professor',
          'assistant professor',
          'associate professor'
        ]
      }
    }).project({ _id: 1 }).toArray();

    const designationIds = teacherDesignations.map(x => x._id);
    if (designationIds.length && await collectionExists(db, 'employees')) {
      const rows = await db.collection('employees')
        .find({ collegeId, designationId: { $in: designationIds } })
        .project({ _id: 1 })
        .toArray();
      rows.forEach(x => teacherIds.add(String(x._id)));
    }
  }

  // 2) Anyone actually used as a teacher in academic allocation/timetable/class teacher.
  for (const [collection, field] of [
    ['teacherassignments', 'teacherId'],
    ['timetables', 'teacherId'],
    ['timetableconstraints', 'teacherId'],
    ['attendancesessions', 'teacherId'],
    ['sections', 'classTeacherId']
  ]) {
    if (!(await collectionExists(db, collection))) continue;
    const ids = await db.collection(collection).distinct(field, {
      collegeId,
      [field]: { $exists: true, $ne: null }
    });
    ids.forEach(id => teacherIds.add(String(id)));
  }

  // 3) Employees linked to a user carrying the Teacher role.
  if (await collectionExists(db, 'users') && await collectionExists(db, 'roles')) {
    const roleMap = await roleMapForCollege(db, collegeId);
    const users = await db.collection('users')
      .find({ collegeId, linkedEmployeeId: { $exists: true, $ne: null } })
      .project({ linkedEmployeeId: 1, roleIds: 1, systemRole: 1 })
      .toArray();

    for (const user of users) {
      const codes = userRoleCodes(user, roleMap);
      if (codes.has('teacher')) teacherIds.add(String(user.linkedEmployeeId));
    }
  }

  return [...teacherIds].filter(id => mongoose.Types.ObjectId.isValid(id))
    .map(id => new mongoose.Types.ObjectId(id));
}

async function protectedEmployeeIds(db, collegeId) {
  if (!(await collectionExists(db, 'users'))) return [];
  const roleMap = await roleMapForCollege(db, collegeId);
  const users = await db.collection('users')
    .find({ collegeId, linkedEmployeeId: { $exists: true, $ne: null } })
    .project({ linkedEmployeeId: 1, roleIds: 1, systemRole: 1 })
    .toArray();

  const protectedIds = new Set();
  for (const user of users) {
    const codes = userRoleCodes(user, roleMap);
    const privileged = [
      'director',
      'institution_director',
      'principal',
      'admin',
      'administrator',
      'platform_owner'
    ].some(code => codes.has(code));
    if (privileged) protectedIds.add(String(user.linkedEmployeeId));
  }
  return [...protectedIds].map(id => new mongoose.Types.ObjectId(id));
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing from backend/.env');

  if (!process.argv.includes(YES)) {
    console.log('');
    console.log('============================================================');
    console.log(' STUDENTS + TEACHERS CLEANUP - PREVIEW ONLY');
    console.log('============================================================');
    console.log('');
    console.log('This script deletes ONLY student records and teacher employees');
    console.log('for one college, plus records that directly depend on them.');
    console.log('');
    console.log('PRESERVED:');
    console.log('  - Platform Owner / Director / Principal / Admin users');
    console.log('  - College profile');
    console.log('  - Branches and Wings');
    console.log('  - Academic Sessions');
    console.log('  - Programs / Classes');
    console.log('  - Sections');
    console.log('  - Subjects / Courses');
    console.log('  - Academic period/configuration master data');
    console.log('  - Designations');
    console.log('  - Non-teaching employees');
    console.log('  - Inquiries and Admission Applications');
    console.log('  - Fee master definitions');
    console.log('  - Library books/copies, Hostel rooms, Transport routes/vehicles');
    console.log('');
    console.log('STUDENTS:');
    console.log('  - Deletes Student documents and direct student operational records');
    console.log('  - Admission Applications are preserved; only studentId is unset');
    console.log('  - Student login accounts are removed');
    console.log('');
    console.log('TEACHERS:');
    console.log('  - Detects teachers from Teacher/Lecturer-like designation,');
    console.log('    TeacherAssignment, Timetable/Class Teacher usage, or Teacher role');
    console.log('  - Explicitly protects Director/Principal/Admin-linked employees');
    console.log('  - Deletes teacher payroll/attendance/leave/loan/contract records');
    console.log('  - Academic master records are preserved; teacher references are cleared');
    console.log('');
    console.log('Run after backup:');
    console.log('  node src/scripts/clear-students-and-teachers-keep-academics.js --yes');
    console.log('');
    console.log('For multiple colleges:');
    console.log('  node src/scripts/clear-students-and-teachers-keep-academics.js --yes --college-id=<id>');
    console.log('');
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const college = await resolveCollege(db);
  const collegeId = college._id;

  console.log(`Connected to: ${db.databaseName}`);
  console.log(`Target college: ${college.name || collegeId}`);
  console.log(`College ID: ${collegeId}`);
  console.log('');

  const students = await db.collection('students')
    .find({ collegeId })
    .project({ _id: 1, admissionApplicationId: 1 })
    .toArray();
  const studentIds = students.map(x => x._id);

  let teacherIds = await teacherEmployeeIds(db, collegeId);
  const protectedIds = await protectedEmployeeIds(db, collegeId);
  const protectedSet = new Set(protectedIds.map(String));
  teacherIds = teacherIds.filter(id => !protectedSet.has(String(id)));

  console.log(`Students detected: ${studentIds.length}`);
  console.log(`Teachers detected: ${teacherIds.length}`);
  console.log(`Protected privileged employee links: ${protectedIds.length}`);
  console.log('');

  // ------------------------------------------------------------
  // STUDENT DEPENDENCIES
  // ------------------------------------------------------------
  if (studentIds.length) {
    console.log('Cleaning student-dependent operational data...');

    for (const [name, field] of [
      ['studentenrollments', 'studentId'],
      ['studentlifecycleevents', 'studentId'],
      ['attendances', 'studentId'],
      ['examresults', 'studentId'],
      ['feeconcessions', 'studentId'],
      ['feeinvoices', 'studentId'],
      ['hostelassignments', 'studentId'],
      ['hostelattendances', 'studentId'],
      ['hostelmesssubscriptions', 'studentId'],
      ['hostelvisitors', 'studentId'],
      ['transportassignments', 'studentId'],
      ['isarecords', 'studentId'],
      ['libraryissues', 'studentId'],
      ['libraryreservations', 'studentId'],
      ['eventregistrations', 'studentId']
    ]) {
      await deleteMany(db, name, { collegeId, [field]: { $in: studentIds } });
    }

    // Complaints may remain meaningful operational history; unlink deleted student only.
    await updateMany(
      db,
      'hostelcomplaints',
      { collegeId, studentId: { $in: studentIds } },
      { $unset: { studentId: '' } }
    );

    // Preserve inquiries/admission applications. Remove only the deleted Student link.
    await updateMany(
      db,
      'admissionapplications',
      { collegeId, studentId: { $in: studentIds } },
      { $unset: { studentId: '' } }
    );

    // Student user accounts are no longer usable and should not point to deleted students.
    await deleteMany(db, 'users', {
      collegeId,
      linkedStudentId: { $in: studentIds }
    });

    await deleteMany(db, 'students', { collegeId, _id: { $in: studentIds } });
  } else {
    console.log('No students found.');
  }

  // ------------------------------------------------------------
  // TEACHER DEPENDENCIES
  // ------------------------------------------------------------
  if (teacherIds.length) {
    console.log('\nCleaning teacher-dependent operational data...');

    for (const [name, field] of [
      ['teacherassignments', 'teacherId'],
      ['timetables', 'teacherId'],
      ['timetableconstraints', 'teacherId'],
      ['staffattendances', 'employeeId'],
      ['employeecontracts', 'employeeId'],
      ['employeeleaves', 'employeeId'],
      ['employeeloans', 'employeeId'],
      ['salarystructures', 'employeeId'],
      ['payrolladjustments', 'employeeId'],
      ['payrollpayments', 'employeeId'],
      ['payrollrecords', 'employeeId'],
      ['libraryissues', 'employeeId'],
      ['libraryreservations', 'employeeId'],
      ['eventregistrations', 'employeeId']
    ]) {
      await deleteMany(db, name, { collegeId, [field]: { $in: teacherIds } });
    }

    // Preserve classes/sections and other master records; clear only teacher references.
    await updateMany(
      db,
      'sections',
      { collegeId, classTeacherId: { $in: teacherIds } },
      { $set: { classTeacherId: null } }
    );
    await updateMany(
      db,
      'attendancesessions',
      { collegeId, teacherId: { $in: teacherIds } },
      { $set: { teacherId: null } }
    );
    await updateMany(
      db,
      'departments',
      { collegeId, headEmployeeId: { $in: teacherIds } },
      { $unset: { headEmployeeId: '' } }
    );
    await updateMany(
      db,
      'events',
      { collegeId, organizerEmployeeId: { $in: teacherIds } },
      { $set: { organizerEmployeeId: null } }
    );
    await updateMany(
      db,
      'hostels',
      { collegeId, wardenEmployeeId: { $in: teacherIds } },
      { $set: { wardenEmployeeId: null } }
    );
    await updateMany(
      db,
      'hostels',
      { collegeId, assistantWardenEmployeeId: { $in: teacherIds } },
      { $set: { assistantWardenEmployeeId: null } }
    );
    await updateMany(
      db,
      'hostelcomplaints',
      { collegeId, assignedToEmployeeId: { $in: teacherIds } },
      { $unset: { assignedToEmployeeId: '' } }
    );
    await updateMany(
      db,
      'isarecords',
      { collegeId, assignedToEmployeeId: { $in: teacherIds } },
      { $unset: { assignedToEmployeeId: '' } }
    );
    await updateMany(
      db,
      'transportvehicles',
      { collegeId, driverEmployeeId: { $in: teacherIds } },
      { $set: { driverEmployeeId: null } }
    );
    await updateMany(
      db,
      'transportvehicles',
      { collegeId, conductorEmployeeId: { $in: teacherIds } },
      { $set: { conductorEmployeeId: null } }
    );

    // Teacher login handling:
    // - delete a pure Teacher login
    // - preserve multi-role/privileged users and only unlink their deleted Employee record
    if (await collectionExists(db, 'users')) {
      const roleMap = await roleMapForCollege(db, collegeId);
      const linkedUsers = await db.collection('users').find({
        collegeId,
        linkedEmployeeId: { $in: teacherIds }
      }).toArray();

      const deleteUserIds = [];
      const unlinkUserIds = [];

      for (const user of linkedUsers) {
        const codes = userRoleCodes(user, roleMap);
        const nonTeacherRoles = [...codes].filter(code => code !== 'teacher');
        if (codes.has('teacher') && nonTeacherRoles.length === 0 && !user.systemRole) {
          deleteUserIds.push(user._id);
        } else {
          unlinkUserIds.push(user._id);
        }
      }

      if (deleteUserIds.length) {
        await deleteMany(db, 'users', { _id: { $in: deleteUserIds } });
      }
      if (unlinkUserIds.length) {
        await updateMany(
          db,
          'users',
          { _id: { $in: unlinkUserIds } },
          { $unset: { linkedEmployeeId: '' } }
        );
      }
    }

    await deleteMany(db, 'employees', { collegeId, _id: { $in: teacherIds } });
  } else {
    console.log('No teacher employees found.');
  }

  // Keep employee numbering monotonic. Do NOT reset EmployeeSequence because
  // non-teaching employees and Director may still use existing employee numbers.

  console.log('');
  console.log('============================================================');
  console.log(' CLEANUP COMPLETE');
  console.log('============================================================');
  console.log(`Students deleted: ${studentIds.length}`);
  console.log(`Teachers deleted: ${teacherIds.length}`);
  console.log('');
  console.log('Preserved: Director/privileged users, academics/classes/sections,');
  console.log('sessions/programs/subjects, inquiries/admission applications,');
  console.log('and non-teaching employees.');
}

main()
  .catch(err => {
    console.error(`\nCleanup failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await mongoose.disconnect(); } catch (_) {}
  });
