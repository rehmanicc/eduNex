require('dotenv').config();
const mongoose = require('mongoose');

const Inquiry = require('../models/Inquiry');
const Program = require('../models/Program');
const College = require('../models/College');
const seq = require('../services/sequenceService');

function getArg(name) {
  const prefix = `--${name}=`;
  const row = process.argv.find(x => x.startsWith(prefix));
  return row ? row.slice(prefix.length).trim() : '';
}

function normalizeContact(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.startsWith('0092')) d = d.slice(2);
  if (d.startsWith('0')) d = '92' + d.slice(1);
  if (d.length === 10 && d.startsWith('3')) d = '92' + d;
  return d;
}

async function nextInquiryNo(collegeId) {
  const year = new Date().getFullYear();
  const n = await seq.nextNumber(collegeId, `inquiry-${year}`);
  return `${String(year).slice(-2)}-${String(n).padStart(5, '0')}`;
}

function resultRows(index, programCode) {
  // Leave 5 students in each program with results completely empty.
  // This gives 10 "Waiting / empty result" inquiries out of 50.
  if (index > 20) return [];

  const base9 = programCode === 'ICS' ? 390 : 385;
  const base10 = programCode === 'ICS' ? 850 : 830;
  const obtained9 = base9 + ((index * 7) % 90);
  const obtained10 = base10 + ((index * 13) % 160);

  return [
    {
      level: '9th',
      obtainedMarks: Math.min(obtained9, 550),
      totalMarks: 550,
      boardRollNo: `9${programCode === 'ICS' ? '1' : '2'}${String(index).padStart(5, '0')}`
    },
    {
      level: '10th',
      obtainedMarks: Math.min(obtained10, 1100),
      totalMarks: 1100,
      boardRollNo: `10${programCode === 'ICS' ? '1' : '2'}${String(index).padStart(5, '0')}`
    }
  ];
}

const firstNames = [
  'Ali','Ahmed','Usman','Hamza','Hassan','Hussain','Bilal','Abdullah','Ahsan','Zain',
  'Saad','Talha','Umer','Huzaifa','Fahad','Danish','Adeel','Farhan','Salman','Shahzaib',
  'Ayesha','Fatima','Maryam','Hira','Maham'
];

const fatherNames = [
  'Muhammad Aslam','Muhammad Akram','Tariq Mehmood','Khalid Mahmood','Rashid Ahmed',
  'Javed Iqbal','Nadeem Ahmed','Arshad Ali','Sajid Hussain','Imran Khan',
  'Zafar Iqbal','Nasir Mehmood','Shahid Ali','Amjad Hussain','Riaz Ahmed',
  'Waqar Ahmed','Iftikhar Ali','Abid Hussain','Azhar Mehmood','Naveed Iqbal',
  'Mazhar Hussain','Saleem Ahmed','Munir Ahmed','Asif Mehmood','Bashir Ahmed'
];

async function findProgram(collegeId, kind) {
  if (kind === 'ICS') {
    return Program.findOne({
      collegeId,
      isActive: { $ne: false },
      $or: [
        { name: /^ICS$/i },
        { code: /^ICS$/i },
        { name: /\bICS\b/i }
      ]
    });
  }

  return Program.findOne({
    collegeId,
    isActive: { $ne: false },
    $or: [
      { name: /^FSc Medical$/i },
      { name: /F\.?Sc.*Medical/i },
      { name: /Medical/i },
      { code: /FSM|FSCM|MED/i }
    ]
  });
}

async function resolveCollege() {
  const requestedCollege = getArg('college');

  if (requestedCollege) {
    const college = await College.findOne({ name: new RegExp(`^${requestedCollege.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!college) throw new Error(`College not found: ${requestedCollege}`);
    return college;
  }

  const colleges = await College.find({ isActive: { $ne: false } }).sort({ createdAt: 1 });
  const matches = [];

  for (const college of colleges) {
    const [ics, medical] = await Promise.all([
      findProgram(college._id, 'ICS'),
      findProgram(college._id, 'FSC_MEDICAL')
    ]);
    if (ics && medical) matches.push({ college, ics, medical });
  }

  if (matches.length === 0) {
    throw new Error('No college was found containing both ICS and FSc Medical programs.');
  }

  if (matches.length > 1) {
    console.log('More than one college contains both programs:');
    matches.forEach(x => console.log(` - ${x.college.name}`));
    throw new Error('Run again with --college="Exact College Name"');
  }

  return matches[0].college;
}

async function createForProgram(college, program, programCode, startContact) {
  let created = 0;

  for (let i = 1; i <= 25; i++) {
    const suffix = String(startContact + i).padStart(7, '0');
    const contactNo = `03${programCode === 'ICS' ? '10' : '11'}${suffix.slice(-7)}`;
    const normalizedContactNo = normalizeContact(contactNo);

    const studentName = `${firstNames[i - 1]} ${programCode === 'ICS' ? 'ICS' : 'Medical'} ${String(i).padStart(2, '0')}`;
    const fatherName = fatherNames[i - 1];

    await Inquiry.create({
      collegeId: college._id,
      inquiryNo: await nextInquiryNo(college._id),
      studentName,
      fatherName,
      previousSchool: i % 3 === 0 ? 'Government High School Jhang' : i % 3 === 1 ? 'Superior School Jhang' : 'Allied School Jhang',
      previousResults: resultRows(i, programCode),
      address: `Jhang, Punjab - Sample Address ${i}`,
      contactNo,
      normalizedContactNo,
      programId: program._id,
      referenceType: i % 4 === 0 ? 'advertisement' : i % 4 === 1 ? 'walk_in' : i % 4 === 2 ? 'social_media' : 'other',
      referenceDetail: i % 4 === 3 ? 'Sample bulk inquiry seed' : undefined,
      status: 'pending',
      notes: `Sample inquiry generated for ${program.name}`
    });

    created++;
  }

  return created;
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing from backend/.env');

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB: ${mongoose.connection.name}`);

  const college = await resolveCollege();
  const [ics, medical] = await Promise.all([
    findProgram(college._id, 'ICS'),
    findProgram(college._id, 'FSC_MEDICAL')
  ]);

  if (!ics) throw new Error(`ICS program not found for ${college.name}`);
  if (!medical) throw new Error(`FSc Medical program not found for ${college.name}`);

  console.log(`College: ${college.name}`);
  console.log(`ICS program: ${ics.name} (${ics.code})`);
  console.log(`FSc Medical program: ${medical.name} (${medical.code})`);

  const runSeed = Date.now() % 10000000;
  const icsCreated = await createForProgram(college, ics, 'ICS', runSeed);
  const medicalCreated = await createForProgram(college, medical, 'MED', runSeed + 100);

  console.log('');
  console.log('========================================');
  console.log(' Sample inquiries created successfully');
  console.log('========================================');
  console.log(`ICS:          ${icsCreated}`);
  console.log(`FSc Medical:  ${medicalCreated}`);
  console.log(`Total:        ${icsCreated + medicalCreated}`);
  console.log('Students with completely empty results: 10');
  console.log('  - ICS: 5');
  console.log('  - FSc Medical: 5');
}

main()
  .catch(err => {
    console.error('\nERROR:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
