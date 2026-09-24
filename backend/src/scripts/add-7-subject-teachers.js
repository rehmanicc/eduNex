require('dotenv').config();
const mongoose = require('mongoose');

const College = require('../models/College');
const Branch = require('../models/Branch');
const Course = require('../models/Course');
const Designation = require('../models/Designation');
const Employee = require('../models/Employee');
const EmployeeSequence = require('../models/EmployeeSequence');
const { seedDefaultDesignations } = require('../services/designationService');

function formatEmployeeNo(number) {
  return `EMP-${String(number).padStart(2, '0')}`;
}

async function getStartingNumber(collegeId) {
  const employees = await Employee.find({ collegeId })
    .select('employeeNo employeeCode')
    .lean();

  let max = 0;
  for (const employee of employees) {
    const value = employee.employeeNo || employee.employeeCode || '';
    const match = /^EMP-(\d+)$/.exec(value) || /^E(\d+)$/.exec(value);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

async function nextEmployeeNo(collegeId) {
  let sequence = await EmployeeSequence.findOne({ collegeId });
  if (!sequence) {
    const startingNumber = await getStartingNumber(collegeId);
    try {
      sequence = await EmployeeSequence.create({ collegeId, lastNumber: startingNumber });
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

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : '';
}

async function resolveCollege() {
  const requestedId = argValue('college-id');
  const requestedName = argValue('college');

  if (requestedId) {
    const row = await College.findById(requestedId);
    if (!row) throw new Error(`College not found for id ${requestedId}`);
    return row;
  }

  if (requestedName) {
    const row = await College.findOne({ name: new RegExp(`^${requestedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!row) throw new Error(`College not found for name "${requestedName}"`);
    return row;
  }

  const rows = await College.find({ isActive: { $ne: false } }).sort({ createdAt: 1 }).limit(2);
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new Error('No active college found.');
  throw new Error('More than one college found. Run with --college-id=... or --college="College Name".');
}

const SUBJECTS = [
  {
    key: 'english', label: 'English', aliases: ['english'], codes: ['ENG'],
    teacher: { name: 'Muhammad Usman', fatherName: 'Abdul Rehman', cnic: '35202-7100001-1', mobileNo: '03017100001' }
  },
  {
    key: 'urdu', label: 'Urdu', aliases: ['urdu'], codes: ['URD'],
    teacher: { name: 'Sadia Noor', fatherName: 'Muhammad Saleem', cnic: '35202-7100002-2', mobileNo: '03017100002' }
  },
  {
    key: 'math', label: 'Mathematics', aliases: ['mathematics', 'math', 'maths'], codes: ['MATH', 'MAT'],
    teacher: { name: 'Imran Khalid', fatherName: 'Khalid Mehmood', cnic: '35202-7100003-3', mobileNo: '03017100003' }
  },
  {
    key: 'physics', label: 'Physics', aliases: ['physics'], codes: ['PHY', 'PHYS'],
    teacher: { name: 'Adeel Ahmad', fatherName: 'Rashid Ahmad', cnic: '35202-7100004-4', mobileNo: '03017100004' }
  },
  {
    key: 'computer', label: 'Computer Science', aliases: ['computer science', 'computer', 'computing'], codes: ['CS', 'COMP'],
    teacher: { name: 'Hina Farooq', fatherName: 'Farooq Ahmed', cnic: '35202-7100005-5', mobileNo: '03017100005' }
  },
  {
    key: 'biology', label: 'Biology', aliases: ['biology', 'bio'], codes: ['BIO'],
    teacher: { name: 'Dr. Ayesha Riaz', fatherName: 'Riaz Hussain', cnic: '35202-7100006-6', mobileNo: '03017100006' }
  },
  {
    key: 'islamiat', label: 'Islamiat', aliases: ['islamiat', 'islamiyat', 'islamic studies'], codes: ['ISL', 'ISLAMIAT'],
    teacher: { name: 'Hafiz Bilal Ahmed', fatherName: 'Muhammad Iqbal', cnic: '35202-7100007-7', mobileNo: '03017100007' }
  }
];

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function resolveCourse(collegeId, subject) {
  const courses = await Course.find({ collegeId, isActive: { $ne: false } })
    .sort({ periodNumber: 1, createdAt: 1 });

  const aliases = new Set(subject.aliases.map(normalize));
  const codes = new Set(subject.codes.map(code => String(code).trim().toUpperCase()));

  let match = courses.find(course => aliases.has(normalize(course.name)));
  if (!match) match = courses.find(course => codes.has(String(course.code || '').trim().toUpperCase()));
  if (!match) {
    match = courses.find(course => {
      const name = normalize(course.name);
      return [...aliases].some(alias => name.includes(alias) || alias.includes(name));
    });
  }
  return match || null;
}

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/college_management';
  await mongoose.connect(uri);
  console.log(`Connected: ${mongoose.connection.name}`);

  const college = await resolveCollege();
  console.log(`College: ${college.name} (${college._id})`);

  const branch = await Branch.findOne({ collegeId: college._id, isActive: { $ne: false } }).sort({ createdAt: 1 });
  if (!branch) throw new Error('No active branch found. Configure a branch before adding employees.');
  console.log(`Primary Branch: ${branch.name}`);

  await seedDefaultDesignations(college._id);
  const designation = await Designation.findOne({
    collegeId: college._id,
    category: 'academic_staff',
    normalizedName: 'teacher',
    isActive: true
  }) || await Designation.findOne({
    collegeId: college._id,
    category: 'academic_staff',
    normalizedName: 'lecturer',
    isActive: true
  });

  if (!designation) throw new Error('Academic Teacher/Lecturer designation not found.');
  console.log(`Designation: ${designation.name}`);

  const resolved = [];
  const missing = [];
  for (const subject of SUBJECTS) {
    const course = await resolveCourse(college._id, subject);
    if (!course) missing.push(subject.label);
    else resolved.push({ subject, course });
  }

  if (missing.length) {
    throw new Error(
      `Cannot create teachers because these subjects/courses are not configured: ${missing.join(', ')}. ` +
      'Add/assign those subjects in Academics > Courses / Subjects, then run the script again.'
    );
  }

  console.log('\nResolved primary subjects:');
  for (const { subject, course } of resolved) {
    console.log(`  ${subject.label.padEnd(17)} -> ${course.name} (${course.code || 'no code'})`);
  }

  const created = [];
  const skipped = [];

  for (const { subject, course } of resolved) {
    const sample = subject.teacher;
    const existing = await Employee.findOne({
      collegeId: college._id,
      $or: [{ cnic: sample.cnic }, { mobileNo: sample.mobileNo }]
    });

    if (existing) {
      skipped.push(`${sample.name} (${subject.label}) - already exists as ${existing.employeeNo}`);
      continue;
    }

    const employeeNo = await nextEmployeeNo(college._id);
    const employee = await Employee.create({
      collegeId: college._id,
      employeeNo,
      employeeCode: employeeNo,
      name: sample.name,
      fatherName: sample.fatherName,
      cnic: sample.cnic,
      qualification: subject.key === 'biology' ? 'mphil' : 'master',
      mobileNo: sample.mobileNo,
      phone: sample.mobileNo,
      address: 'Jhang, Punjab - Sample Teacher Address',
      dateOfBirth: new Date(subject.key === 'biology' ? '1988-05-15' : '1992-03-15'),
      dob: new Date(subject.key === 'biology' ? '1988-05-15' : '1992-03-15'),
      dateOfJoining: new Date('2026-08-01'),
      joiningDate: new Date('2026-08-01'),
      category: 'academic_staff',
      subjectId: course._id,
      designationId: designation._id,
      designation: designation.name,
      branchId: branch._id,
      photoUrl: '',
      isActive: true
    });

    created.push(`${employee.employeeNo} - ${employee.name} - ${subject.label}`);
  }

  console.log('\n==============================================');
  console.log('  SUBJECT TEACHER SEED COMPLETE');
  console.log('==============================================');
  console.log(`Created: ${created.length}`);
  created.forEach(line => console.log(`  + ${line}`));

  if (skipped.length) {
    console.log(`Skipped: ${skipped.length}`);
    skipped.forEach(line => console.log(`  = ${line}`));
  }

  console.log('\nNo Wing is assigned; teachers remain branch-wide as intended.');
  console.log('Primary Subject is only the profile/default subject; Teacher Assignments can use other subjects later.');
}

main()
  .catch(error => {
    console.error(`\nSeed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await mongoose.disconnect(); } catch (_) {}
  });
