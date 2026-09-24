require('dotenv').config();

const mongoose = require('mongoose');
const College = require('../models/College');
const Program = require('../models/Program');
const AcademicSession = require('../models/AcademicSession');
const Inquiry = require('../models/Inquiry');
const Employee = require('../models/Employee');
const EmployeeSequence = require('../models/EmployeeSequence');
const Designation = require('../models/Designation');
const Course = require('../models/Course');

let sequenceService = null;
try {
  sequenceService = require('../services/sequenceService');
} catch (_) {}

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(x => x.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : '';
}

function hasPath(model, path) {
  return Boolean(model?.schema?.path(path));
}

function setIfPath(model, target, path, value) {
  if (value !== undefined && hasPath(model, path)) target[path] = value;
}

function enumChoice(model, path, preferred, fallback) {
  const schemaPath = model?.schema?.path(path);
  const values = schemaPath?.enumValues || [];
  if (!values.length) return fallback;

  for (const wanted of preferred) {
    const hit = values.find(v => String(v).toLowerCase() === String(wanted).toLowerCase());
    if (hit !== undefined) return hit;
  }
  return values[0];
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

  const colleges = await College.find({}).select('_id name').lean();
  if (colleges.length === 1) return colleges[0];
  if (!colleges.length) throw new Error('No college exists in the database.');

  throw new Error(
    'Multiple colleges exist. Use --college-id=<id> or --college="Exact College Name".'
  );
}

async function resolveIcsProgram(collegeId) {
  const candidates = await Program.find({
    collegeId,
    isActive: { $ne: false },
    $or: [
      { code: /^ICS$/i },
      { name: /^ICS$/i },
      { name: /intermediate.*computer|computer.*science/i }
    ]
  }).sort({ createdAt: 1 });

  if (candidates.length === 1) return candidates[0];

  const exact = candidates.find(
    p => String(p.code || '').trim().toUpperCase() === 'ICS' ||
         String(p.name || '').trim().toUpperCase() === 'ICS'
  );
  if (exact) return exact;

  if (!candidates.length) {
    throw new Error('No active ICS Program was found in Academics.');
  }

  throw new Error(
    `More than one ICS-like program exists: ${candidates.map(x => `${x.name} [${x.code}]`).join(', ')}`
  );
}

async function resolveSession(collegeId, program) {
  // Prefer the session already attached to the ICS program, if the current schema stores it there.
  for (const field of ['academicSessionId', 'sessionId']) {
    if (program[field]) {
      const row = await AcademicSession.findOne({ _id: program[field], collegeId });
      if (row) return row;
    }
  }

  let current = await AcademicSession.findOne({
    collegeId,
    $or: [{ isCurrent: true }, { isActive: true }]
  }).sort({ isCurrent: -1, startDate: -1, createdAt: -1 });

  if (current) return current;

  const sessions = await AcademicSession.find({ collegeId }).sort({ startDate: -1, createdAt: -1 });
  if (!sessions.length) throw new Error('No Academic Session exists.');
  return sessions[0];
}

async function nextInquiryNo(collegeId) {
  const year = new Date().getFullYear();

  if (!sequenceService || typeof sequenceService.nextNumber !== 'function') {
    throw new Error('sequenceService.nextNumber is unavailable in the current project.');
  }

  const n = await sequenceService.nextNumber(collegeId, `inquiry-${year}`);
  return `${String(year).slice(-2)}-${String(n).padStart(5, '0')}`;
}

function normalizeContact(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.startsWith('0092')) d = d.slice(2);
  if (d.startsWith('0')) d = '92' + d.slice(1);
  if (d.length === 10 && d.startsWith('3')) d = '92' + d;
  return d;
}

function buildInquiryBase({ collegeId, programId, sessionId, item, inquiryNo, index }) {
  const doc = {};

  setIfPath(Inquiry, doc, 'collegeId', collegeId);
  setIfPath(Inquiry, doc, 'inquiryNo', inquiryNo);
  setIfPath(Inquiry, doc, 'academicSessionId', sessionId);
  setIfPath(Inquiry, doc, 'sessionId', sessionId);
  setIfPath(Inquiry, doc, 'programId', programId);

  setIfPath(Inquiry, doc, 'studentName', item.name);
  setIfPath(Inquiry, doc, 'name', item.name);
  setIfPath(Inquiry, doc, 'fatherName', item.fatherName);
  setIfPath(Inquiry, doc, 'gender', item.gender);

  setIfPath(Inquiry, doc, 'contactNo', item.contactNo);
  setIfPath(Inquiry, doc, 'normalizedContactNo', normalizeContact(item.contactNo));
  setIfPath(Inquiry, doc, 'phone', item.contactNo);
  setIfPath(Inquiry, doc, 'mobileNo', item.contactNo);
  setIfPath(Inquiry, doc, 'whatsappNo', item.contactNo);
  setIfPath(Inquiry, doc, 'email', `ics.inquiry${index + 1}@example.local`);

  setIfPath(Inquiry, doc, 'currentSchool', item.previousSchool);
  setIfPath(Inquiry, doc, 'previousSchool', item.previousSchool);
  setIfPath(Inquiry, doc, 'school', item.previousSchool);

  if (hasPath(Inquiry, 'referenceType')) {
    doc.referenceType = enumChoice(
      Inquiry,
      'referenceType',
      ['walk_in', 'walk-in', 'direct', 'self', 'other'],
      'walk_in'
    );
  }

  if (hasPath(Inquiry, 'status')) {
    doc.status = enumChoice(
      Inquiry,
      'status',
      ['pending', 'new', 'inquiry', 'open', 'active'],
      'pending'
    );
  }

  setIfPath(Inquiry, doc, 'inquiryDate', new Date());
  setIfPath(Inquiry, doc, 'remarks', 'Sample ICS inquiry for workflow testing.');
  setIfPath(Inquiry, doc, 'notes', 'Sample ICS inquiry for workflow testing.');

  return doc;
}

function assertRequiredInquiryFields(doc) {
  const missing = [];

  for (const [path, schemaPath] of Object.entries(Inquiry.schema.paths)) {
    if (!schemaPath?.isRequired) continue;
    if (['_id', '__v', 'createdAt', 'updatedAt'].includes(path)) continue;
    const value = doc[path];
    if (value === undefined || value === null || value === '') missing.push(path);
  }

  if (missing.length) {
    throw new Error(
      `Current Inquiry schema has required field(s) not covered by this seed: ${missing.join(', ')}. ` +
      `No data was created.`
    );
  }
}

function formatEmployeeNo(number) {
  return `EMP-${String(number).padStart(2, '0')}`;
}

async function nextEmployeeNo(collegeId) {
  let sequence = await EmployeeSequence.findOne({ collegeId });

  if (!sequence) {
    const employees = await Employee.find({ collegeId })
      .select('employeeNo employeeCode')
      .lean();

    let max = 0;
    for (const employee of employees) {
      const value = employee.employeeNo || employee.employeeCode || '';
      const match = /^EMP-(\d+)$/.exec(value) || /^E(\d+)$/.exec(value);
      if (match) max = Math.max(max, Number(match[1]));
    }

    try {
      await EmployeeSequence.create({ collegeId, lastNumber: max });
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
      normalizedName,
      isActive: { $ne: false }
    });
    if (row) return row;
  }

  const academic = await Designation.findOne({
    collegeId,
    category: 'academic_staff',
    isActive: { $ne: false }
  }).sort({ isSystemDefault: -1, createdAt: 1 });

  if (!academic) {
    throw new Error(
      'No active Teacher/Lecturer Academic Staff designation exists. Create one in Designations first.'
    );
  }

  return academic;
}

async function resolveTeacherSubjects(collegeId, programId) {
  let rows = await Course.find({
    collegeId,
    programId,
    isActive: { $ne: false }
  }).sort({ name: 1 });

  if (!rows.length) {
    rows = await Course.find({
      collegeId,
      isActive: { $ne: false }
    }).sort({ name: 1 });
  }

  if (!rows.length) {
    throw new Error('No active Course/Subject exists for teacher Primary Subject.');
  }

  return rows;
}

const SAMPLE_INQUIRIES = [
  { name: 'Ali Hassan', fatherName: 'Muhammad Hassan', gender: 'male', contactNo: '03011001001', previousSchool: 'Chenab Public School' },
  { name: 'Hamza Tariq', fatherName: 'Tariq Mehmood', gender: 'male', contactNo: '03011001002', previousSchool: 'Jhang Public School' },
  { name: 'Usman Raza', fatherName: 'Raza Ahmad', gender: 'male', contactNo: '03011001003', previousSchool: 'Allied School Jhang' },
  { name: 'Ayesha Noor', fatherName: 'Muhammad Imran', gender: 'female', contactNo: '03011001004', previousSchool: 'Chenab College' },
  { name: 'Fatima Zahra', fatherName: 'Syed Abbas', gender: 'female', contactNo: '03011001005', previousSchool: 'City School Jhang' },
  { name: 'Hira Aslam', fatherName: 'Muhammad Aslam', gender: 'female', contactNo: '03011001006', previousSchool: 'Punjab School System' }
];

const SAMPLE_TEACHERS = [
  { name: 'Ahmed Raza', fatherName: 'Ghulam Raza', cnic: '3520211000001', mobile: '03012002001', qualification: 'master', dob: '1988-03-12' },
  { name: 'Bilal Ahmad', fatherName: 'Muhammad Akram', cnic: '3520211000002', mobile: '03012002002', qualification: 'mphil', dob: '1986-07-19' },
  { name: 'Kashif Mehmood', fatherName: 'Abdul Hameed', cnic: '3520211000003', mobile: '03012002003', qualification: 'master', dob: '1990-01-27' },
  { name: 'Sana Iqbal', fatherName: 'Muhammad Iqbal', cnic: '3520211000004', mobile: '03012002004', qualification: 'mphil', dob: '1989-06-08' },
  { name: 'Nida Fatima', fatherName: 'Muhammad Ashraf', cnic: '3520211000005', mobile: '03012002005', qualification: 'master', dob: '1991-10-14' },
  { name: 'Rabia Khan', fatherName: 'Nadeem Khan', cnic: '3520211000006', mobile: '03012002006', qualification: 'master', dob: '1992-02-22' }
];

async function validateDuplicates(collegeId) {
  const inquiryContacts = SAMPLE_INQUIRIES.map(x => x.contactNo);
  const teacherCnics = SAMPLE_TEACHERS.map(x => x.cnic);

  const inquiryOr = [];
  for (const field of ['contactNo', 'phone', 'mobileNo']) {
    if (hasPath(Inquiry, field)) inquiryOr.push({ [field]: { $in: inquiryContacts } });
  }

  const existingInquiries = inquiryOr.length
    ? await Inquiry.find({ collegeId, $or: inquiryOr }).select('inquiryNo studentName name contactNo phone mobileNo').lean()
    : [];

  const existingTeachers = await Employee.find({
    collegeId,
    $or: [
      { cnic: { $in: teacherCnics } },
      { name: { $in: SAMPLE_TEACHERS.map(x => x.name) } }
    ]
  }).select('employeeNo name cnic').lean();

  if (existingInquiries.length || existingTeachers.length) {
    const parts = [];
    if (existingInquiries.length) parts.push(`Sample inquiries already found: ${existingInquiries.length}`);
    if (existingTeachers.length) parts.push(`Sample teachers already found: ${existingTeachers.length}`);
    throw new Error(`${parts.join('. ')}. Nothing was created.`);
  }
}

async function createInquiries({ collegeId, program, session }) {
  const rows = [];

  for (let i = 0; i < SAMPLE_INQUIRIES.length; i++) {
    const item = SAMPLE_INQUIRIES[i];
    const inquiryNo = await nextInquiryNo(collegeId);

    const doc = buildInquiryBase({
      collegeId,
      programId: program._id,
      sessionId: session._id,
      item,
      inquiryNo,
      index: i
    });

    assertRequiredInquiryFields(doc);

    const inquiry = await Inquiry.create(doc);

    rows.push({
      inquiryNo: inquiry.inquiryNo || inquiryNo,
      name: inquiry.studentName || inquiry.name || item.name,
      gender: inquiry.gender || item.gender,
      program: program.name
    });
  }

  return rows;
}

async function createTeachers({ collegeId, program, designation, subjects }) {
  const rows = [];

  for (let i = 0; i < SAMPLE_TEACHERS.length; i++) {
    const item = SAMPLE_TEACHERS[i];
    const subject = subjects[i % subjects.length];
    const employeeNo = await nextEmployeeNo(collegeId);

    const payload = {
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
    };

    // Let the active Employee schema keep only fields it supports.
    const employee = await Employee.create(payload);

    rows.push({
      employeeNo: employee.employeeNo || employee.employeeCode || employeeNo,
      name: employee.name,
      designation: designation.name,
      primarySubject: subject.name
    });
  }

  return rows;
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing from backend/.env');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const college = await resolveCollege();
  const program = await resolveIcsProgram(college._id);
  const session = await resolveSession(college._id, program);
  const designation = await resolveTeacherDesignation(college._id);
  const subjects = await resolveTeacherSubjects(college._id, program._id);

  console.log('');
  console.log('============================================================');
  console.log(' 6 ICS INQUIRIES + 6 TEACHERS');
  console.log('============================================================');
  console.log(`College: ${college.name}`);
  console.log(`Program: ${program.name} [${program.code}]`);
  console.log(`Session: ${session.name}`);
  console.log(`Teacher Designation: ${designation.name}`);
  console.log('');
  console.log('This seed creates:');
  console.log('  - 6 ICS INQUIRIES only: 3 male + 3 female');
  console.log('  - 6 Academic Staff teacher employee records');
  console.log('');
  console.log('It DOES NOT create:');
  console.log('  - Admission Applications / Forms');
  console.log('  - Students');
  console.log('  - Student Enrollment');
  console.log('  - Roll Numbers');
  console.log('  - Student Fee Plans');
  console.log('  - Vouchers / Payments');
  console.log('  - Sections');
  console.log('');
  console.log('Important: no Boys/Girls section is required for inquiries.');
  console.log('');

  await validateDuplicates(college._id);

  // Validate first inquiry against the CURRENT schema before any writes.
  const previewNo = 'PREVIEW';
  const previewDoc = buildInquiryBase({
    collegeId: college._id,
    programId: program._id,
    sessionId: session._id,
    item: SAMPLE_INQUIRIES[0],
    inquiryNo: previewNo,
    index: 0
  });

  // inquiryNo may have a strict format validator, so only check required paths here.
  assertRequiredInquiryFields(previewDoc);

  if (!process.argv.includes('--yes')) {
    console.log('PREVIEW ONLY - nothing was created.');
    console.log('');
    console.log('Run:');
    console.log('  node src/scripts/seed-6-ics-inquiries-6-teachers.js --yes');
    return;
  }

  const inquiries = await createInquiries({
    collegeId: college._id,
    program,
    session
  });

  const teachers = await createTeachers({
    collegeId: college._id,
    program,
    designation,
    subjects
  });

  console.log('');
  console.log('INQUIRIES CREATED');
  console.table(inquiries);

  console.log('');
  console.log('TEACHERS CREATED');
  console.table(teachers);

  console.log('');
  console.log('============================================================');
  console.log(' SAMPLE DATA CREATION COMPLETE');
  console.log('============================================================');
  console.log(`Inquiries: ${inquiries.length}`);
  console.log(`Teachers: ${teachers.length}`);
  console.log('No admissions or students were created.');
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
