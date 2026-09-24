require('dotenv').config();

const mongoose = require('mongoose');
const College = require('../models/College');
const Program = require('../models/Program');
const AcademicSession = require('../models/AcademicSession');
const Section = require('../models/Section');
const Student = require('../models/Student');
const StudentEnrollment = require('../models/StudentEnrollment');
const Employee = require('../models/Employee');
const EmployeeSequence = require('../models/EmployeeSequence');
const Designation = require('../models/Designation');
const Course = require('../models/Course');
const { generateRollNo } = require('../services/rollNumberService');
const seq = require('../services/sequenceService');

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(x => x.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : '';
}

function formatEmployeeNo(number) {
  return `EMP-${String(number).padStart(2, '0')}`;
}

async function resolveCollege() {
  const requestedId = argValue('college-id');
  const requestedName = argValue('college');

  if (requestedId) {
    if (!mongoose.Types.ObjectId.isValid(requestedId)) {
      throw new Error(`Invalid college id: ${requestedId}`);
    }
    const row = await College.findById(requestedId);
    if (!row) throw new Error(`College not found: ${requestedId}`);
    return row;
  }

  if (requestedName) {
    const row = await College.findOne({ name: requestedName });
    if (!row) throw new Error(`College not found with exact name: ${requestedName}`);
    return row;
  }

  const envId = String(process.env.LOCAL_DEV_COLLEGE_ID || '').trim();
  if (envId && mongoose.Types.ObjectId.isValid(envId)) {
    const envCollege = await College.findById(envId);
    if (envCollege) return envCollege;
    console.log(`Warning: LOCAL_DEV_COLLEGE_ID (${envId}) is stale; using database discovery.`);
  }

  const rows = await College.find({}).select('_id name').lean();
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new Error('No college exists in the database.');

  throw new Error(
    'Multiple colleges exist. Use --college-id=<id> or --college="Exact College Name".'
  );
}

async function resolveIcsProgram(collegeId) {
  const exact = await Program.findOne({
    collegeId,
    isActive: true,
    $or: [
      { code: /^ICS$/i },
      { name: /^ICS$/i },
      { name: /intermediate.*computer|computer.*science/i }
    ]
  }).sort({ createdAt: 1 });

  if (exact) return exact;

  const candidates = await Program.find({
    collegeId,
    isActive: true,
    $or: [{ code: /ICS/i }, { name: /ICS/i }]
  }).sort({ createdAt: 1 });

  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) {
    throw new Error('No active ICS Program was found. Create/enable ICS in Academics first.');
  }

  throw new Error(
    `More than one ICS-like Program exists: ${candidates.map(x => `${x.name} [${x.code}]`).join(', ')}`
  );
}

async function resolveSession(collegeId) {
  const current = await AcademicSession.findOne({ collegeId, isCurrent: true }).sort({ createdAt: -1 });
  if (current) return current;

  const sessions = await AcademicSession.find({ collegeId }).sort({ startDate: -1, createdAt: -1 });
  if (sessions.length === 1) return sessions[0];
  if (!sessions.length) throw new Error('No Academic Session exists.');

  throw new Error(
    `No session is marked Current. Available: ${sessions.map(s => s.name).join(', ')}`
  );
}

async function resolveSections(collegeId, program, session) {
  const rows = await Section.find({
    collegeId,
    programId: program._id,
    academicSessionId: session._id,
    periodNumber: 1,
    isActive: true
  }).sort({ name: 1 });

  const boys = rows.find(x => x.genderType === 'boys');
  const girls = rows.find(x => x.genderType === 'girls');

  if (!boys || !girls) {
    throw new Error(
      `ICS needs active Period/Year 1 Boys and Girls sections for ${session.name}. ` +
      `Found: ${rows.map(x => `${x.name} (${x.genderType})`).join(', ') || 'none'}.`
    );
  }

  const existingBoys = await Student.countDocuments({
    collegeId, sectionId: boys._id, status: 'active'
  });
  const existingGirls = await Student.countDocuments({
    collegeId, sectionId: girls._id, status: 'active'
  });

  if (boys.capacity && existingBoys + 3 > boys.capacity) {
    throw new Error(`Boys section ${boys.name} does not have room for 3 sample students.`);
  }
  if (girls.capacity && existingGirls + 3 > girls.capacity) {
    throw new Error(`Girls section ${girls.name} does not have room for 3 sample students.`);
  }

  return { boys, girls };
}

async function nextEmployeeNo(collegeId) {
  let sequence = await EmployeeSequence.findOne({ collegeId });

  if (!sequence) {
    const employees = await Employee.find({ collegeId }).select('employeeNo employeeCode').lean();
    let max = 0;
    for (const employee of employees) {
      const value = employee.employeeNo || employee.employeeCode || '';
      const match = /^EMP-(\d+)$/.exec(value) || /^E(\d+)$/.exec(value);
      if (match) max = Math.max(max, Number(match[1]));
    }

    try {
      sequence = await EmployeeSequence.create({ collegeId, lastNumber: max });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  const updated = await EmployeeSequence.findOneAndUpdate(
    { collegeId },
    { $inc: { lastNumber: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return formatEmployeeNo(updated.lastNumber);
}

async function resolveTeacherDesignation(collegeId) {
  const preferred = [
    'teacher',
    'lecturer',
    'instructor',
    'assistant professor',
    'associate professor',
    'professor'
  ];

  for (const normalizedName of preferred) {
    const row = await Designation.findOne({
      collegeId,
      category: 'academic_staff',
      normalizedName,
      isActive: true
    });
    if (row) return row;
  }

  const first = await Designation.findOne({
    collegeId,
    category: 'academic_staff',
    isActive: true
  }).sort({ isSystemDefault: -1, createdAt: 1 });

  if (!first) {
    throw new Error(
      'No active Academic Staff designation exists. Create/enable Teacher or Lecturer in Designations first.'
    );
  }

  return first;
}

async function resolveTeacherSubjects(collegeId, programId) {
  let rows = await Course.find({
    collegeId,
    programId,
    isActive: true
  }).sort({ periodNumber: 1, name: 1 });

  if (!rows.length) {
    rows = await Course.find({
      collegeId,
      isActive: true
    }).sort({ name: 1 });
  }

  if (!rows.length) {
    throw new Error('No active Course/Subject exists to use as teachers\' Primary Subject.');
  }

  return rows;
}

const SAMPLE_STUDENTS = [
  { name: 'Ali Hassan', fatherName: 'Muhammad Hassan', gender: 'male', phone: '03011001001', dob: '2009-02-14' },
  { name: 'Hamza Tariq', fatherName: 'Tariq Mehmood', gender: 'male', phone: '03011001002', dob: '2009-05-21' },
  { name: 'Usman Raza', fatherName: 'Raza Ahmad', gender: 'male', phone: '03011001003', dob: '2008-11-08' },
  { name: 'Ayesha Noor', fatherName: 'Muhammad Imran', gender: 'female', phone: '03011001004', dob: '2009-01-25' },
  { name: 'Fatima Zahra', fatherName: 'Syed Abbas', gender: 'female', phone: '03011001005', dob: '2008-09-16' },
  { name: 'Hira Aslam', fatherName: 'Muhammad Aslam', gender: 'female', phone: '03011001006', dob: '2009-04-03' }
];

const SAMPLE_TEACHERS = [
  { name: 'Ahmed Raza', fatherName: 'Ghulam Raza', cnic: '3520211000001', mobile: '03012002001', qualification: 'master', dob: '1988-03-12' },
  { name: 'Bilal Ahmad', fatherName: 'Muhammad Akram', cnic: '3520211000002', mobile: '03012002002', qualification: 'mphil', dob: '1986-07-19' },
  { name: 'Kashif Mehmood', fatherName: 'Abdul Hameed', cnic: '3520211000003', mobile: '03012002003', qualification: 'master', dob: '1990-01-27' },
  { name: 'Sana Iqbal', fatherName: 'Muhammad Iqbal', cnic: '3520211000004', mobile: '03012002004', qualification: 'mphil', dob: '1989-06-08' },
  { name: 'Nida Fatima', fatherName: 'Muhammad Ashraf', cnic: '3520211000005', mobile: '03012002005', qualification: 'master', dob: '1991-10-14' },
  { name: 'Rabia Khan', fatherName: 'Nadeem Khan', cnic: '3520211000006', mobile: '03012002006', qualification: 'master', dob: '1992-02-22' }
];

async function validateNoSampleDuplicates(collegeId) {
  const studentPhones = SAMPLE_STUDENTS.map(x => x.phone);
  const teacherCnics = SAMPLE_TEACHERS.map(x => x.cnic);

  const existingStudents = await Student.find({
    collegeId,
    $or: [
      { phone: { $in: studentPhones } },
      { name: { $in: SAMPLE_STUDENTS.map(x => x.name) } }
    ]
  }).select('name phone admissionNo').lean();

  const existingTeachers = await Employee.find({
    collegeId,
    $or: [
      { cnic: { $in: teacherCnics } },
      { name: { $in: SAMPLE_TEACHERS.map(x => x.name) } }
    ]
  }).select('name cnic employeeNo').lean();

  if (existingStudents.length || existingTeachers.length) {
    const lines = [];
    if (existingStudents.length) {
      lines.push(`Students already found: ${existingStudents.map(x => `${x.name} (${x.admissionNo})`).join(', ')}`);
    }
    if (existingTeachers.length) {
      lines.push(`Teachers already found: ${existingTeachers.map(x => `${x.name} (${x.employeeNo})`).join(', ')}`);
    }
    throw new Error(
      'Sample data appears to have already been added. Nothing was created.\n' + lines.join('\n')
    );
  }
}

async function createStudents({ collegeId, program, session, boys, girls }) {
  const created = [];

  for (let i = 0; i < SAMPLE_STUDENTS.length; i++) {
    const item = SAMPLE_STUDENTS[i];
    const section = item.gender === 'male' ? boys : girls;

    const rollNo = await generateRollNo({
      collegeId,
      programId: program._id,
      academicSessionId: session._id,
      gender: item.gender
    });

    const admissionNo = await seq.nextAdmissionNo(collegeId);
    const registrationNo = await seq.nextRegistrationNo(collegeId);

    const student = await Student.create({
      collegeId,
      admissionNo,
      registrationNo,
      rollNo,
      name: item.name,
      fatherName: item.fatherName,
      cnic: `35202-${String(5000000 + i).padStart(7, '0')}-${i + 1}`,
      phone: item.phone,
      email: `ics.student${i + 1}@example.local`,
      dateOfBirth: new Date(`${item.dob}T00:00:00.000Z`),
      gender: item.gender,
      address: 'Jhang, Punjab',
      programId: program._id,
      sectionId: section._id,
      academicSessionId: session._id,
      currentSemester: 1,
      currentPeriod: 1,
      admissionDate: new Date(),
      admissionStanding: 'confirmed',
      resultStatus: 'verified',
      status: 'active'
    });

    await StudentEnrollment.create({
      collegeId,
      studentId: student._id,
      academicSessionId: session._id,
      programId: program._id,
      sectionId: section._id,
      semester: 1,
      rollNo,
      status: 'active',
      startedAt: new Date()
    });

    created.push({
      name: student.name,
      gender: student.gender,
      rollNo,
      admissionNo,
      section: section.name
    });
  }

  return created;
}

async function createTeachers({ collegeId, program, designation, subjects }) {
  const created = [];

  for (let i = 0; i < SAMPLE_TEACHERS.length; i++) {
    const item = SAMPLE_TEACHERS[i];
    const subject = subjects[i % subjects.length];
    const employeeNo = await nextEmployeeNo(collegeId);

    const employee = await Employee.create({
      collegeId,
      employeeNo,
      employeeCode: employeeNo,
      name: item.name,
      fatherName: item.fatherName,
      cnic: item.cnic,
      qualification: item.qualification,
      mobileNo: item.mobile,
      phone: item.mobile,
      address: 'Jhang, Punjab',
      dateOfBirth: new Date(`${item.dob}T00:00:00.000Z`),
      dob: new Date(`${item.dob}T00:00:00.000Z`),
      dateOfJoining: new Date('2026-08-01T00:00:00.000Z'),
      joiningDate: new Date('2026-08-01T00:00:00.000Z'),
      category: 'academic_staff',
      subjectId: subject._id,
      designationId: designation._id,
      designation: designation.name,
      branchId: program.branchId,
      email: `teacher${i + 1}@sample.college.local`,
      isActive: true
    });

    created.push({
      name: employee.name,
      employeeNo,
      designation: designation.name,
      primarySubject: subject.name
    });
  }

  return created;
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing from backend/.env');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const college = await resolveCollege();
  const collegeId = college._id;
  const program = await resolveIcsProgram(collegeId);
  const session = await resolveSession(collegeId);
  const { boys, girls } = await resolveSections(collegeId, program, session);
  const designation = await resolveTeacherDesignation(collegeId);
  const subjects = await resolveTeacherSubjects(collegeId, program._id);

  console.log('');
  console.log('============================================================');
  console.log(' SAMPLE ICS STUDENTS + TEACHERS');
  console.log('============================================================');
  console.log(`College: ${college.name}`);
  console.log(`ICS Program: ${program.name} [${program.code}]`);
  console.log(`Academic Session: ${session.name}`);
  console.log(`Boys Section: ${boys.name}`);
  console.log(`Girls Section: ${girls.name}`);
  console.log(`Teacher Designation: ${designation.name}`);
  console.log(`Primary Subjects available: ${subjects.map(x => x.name).join(', ')}`);
  console.log('');
  console.log('Will create:');
  console.log('  - 6 active ICS students: 3 male + 3 female');
  console.log('  - Correct ICS roll numbers using the existing roll-number service');
  console.log('  - 6 matching StudentEnrollment records');
  console.log('  - 6 Academic Staff teacher employees');
  console.log('  - Existing Teacher/Lecturer designation and Course/Subjects will be reused');
  console.log('');
  console.log('Will NOT create:');
  console.log('  - Inquiries or admission forms');
  console.log('  - Fee packages, vouchers or payments');
  console.log('  - Teacher login/User accounts');
  console.log('  - TeacherAssignment/timetable records');
  console.log('');

  await validateNoSampleDuplicates(collegeId);

  if (!process.argv.includes('--yes')) {
    console.log('PREVIEW ONLY - no data created.');
    console.log('');
    console.log('Run:');
    console.log('  node src/scripts/seed-6-ics-students-6-teachers.js --yes');
    return;
  }

  // All structural prerequisites and duplicate checks are completed before writes begin.
  const students = await createStudents({
    collegeId,
    program,
    session,
    boys,
    girls
  });

  const teachers = await createTeachers({
    collegeId,
    program,
    designation,
    subjects
  });

  console.log('');
  console.log('STUDENTS CREATED');
  console.table(students);

  console.log('');
  console.log('TEACHERS CREATED');
  console.table(teachers);

  console.log('');
  console.log('============================================================');
  console.log(' SAMPLE DATA CREATION COMPLETE');
  console.log('============================================================');
  console.log(`Students: ${students.length}`);
  console.log(`Teachers: ${teachers.length}`);
}

main()
  .catch(error => {
    console.error('');
    console.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await mongoose.disconnect(); } catch (_) {}
  });
