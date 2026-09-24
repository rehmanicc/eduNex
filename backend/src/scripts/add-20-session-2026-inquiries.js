require('dotenv').config();
const mongoose = require('mongoose');

const Inquiry = require('../models/Inquiry');
const Program = require('../models/Program');
const College = require('../models/College');
const AcademicSession = require('../models/AcademicSession');
const seq = require('../services/sequenceService');

function normalizeContact(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.startsWith('0092')) d = d.slice(2);
  if (d.startsWith('0')) d = '92' + d.slice(1);
  if (d.length === 10 && d.startsWith('3')) d = '92' + d;
  return d;
}

function esc(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveCollege() {
  const colleges = await College.find({}).sort({ createdAt: 1 });
  if (colleges.length === 0) throw new Error('No college is configured.');
  if (colleges.length > 1) {
    throw new Error(`Expected one sample college, but found ${colleges.length}. Add --college-id support before using this seed in a multi-college database.`);
  }
  return colleges[0];
}

async function resolveSession(collegeId) {
  const sessions = await AcademicSession.find({ collegeId }).sort({ createdAt: 1 });
  const exact = sessions.filter(x => String(x.name || '').trim().toLowerCase() === '2026');
  if (exact.length === 1) return exact[0];

  const containing = sessions.filter(x => /(^|\D)2026(\D|$)/.test(String(x.name || '')));
  if (containing.length === 1) return containing[0];

  if (containing.length > 1) {
    throw new Error(`More than one academic session contains 2026: ${containing.map(x => x.name).join(', ')}`);
  }

  throw new Error(`Academic Session 2026 was not found. Existing sessions: ${sessions.map(x => x.name).join(', ') || '(none)'}`);
}

async function resolveProgram(collegeId, kind) {
  const programs = await Program.find({ collegeId, isActive: { $ne: false } });
  if (kind === 'ICS') {
    return programs.find(x => /^ICS$/i.test(String(x.name || '').trim())) ||
      programs.find(x => /^ICS$/i.test(String(x.code || '').trim())) ||
      programs.find(x => /\bICS\b/i.test(String(x.name || '')));
  }

  return programs.find(x => /^F\.?\s*Sc\.?\s*Medical$/i.test(String(x.name || '').trim())) ||
    programs.find(x => /F\.?\s*Sc.*Medical/i.test(String(x.name || ''))) ||
    programs.find(x => /Medical/i.test(String(x.name || ''))) ||
    programs.find(x => /^(FSM|FSCM|MED)$/i.test(String(x.code || '').trim()));
}

function sessionYear(session) {
  const match = String(session?.name || '').match(/\b(20\d{2})\b/);
  if (match) return Number(match[1]);
  if (session?.startDate) return new Date(session.startDate).getFullYear();
  return 2026;
}

async function nextInquiryNo(collegeId, session) {
  const year = sessionYear(session);
  const n = await seq.nextNumber(collegeId, `inquiry-${year}`);
  return `${String(year).slice(-2)}-${String(n).padStart(5, '0')}`;
}

function resultRows(index, code) {
  // Students 8, 9 and 10 in each program deliberately have no result.
  if (index >= 8) return [];

  const nineBase = code === 'ICS' ? 405 : 395;
  const tenBase = code === 'ICS' ? 865 : 845;
  const obtained9 = Math.min(nineBase + index * 11, 550);
  const obtained10 = Math.min(tenBase + index * 17, 1100);
  const prefix = code === 'ICS' ? '31' : '41';

  return [
    {
      level: '9th',
      obtainedMarks: obtained9,
      totalMarks: 550,
      boardRollNo: `9${prefix}${String(index).padStart(4, '0')}`
    },
    {
      level: '10th',
      obtainedMarks: obtained10,
      totalMarks: 1100,
      boardRollNo: `10${prefix}${String(index).padStart(4, '0')}`
    }
  ];
}

const students = {
  ICS: [
    ['Ali Raza', 'Muhammad Aslam'],
    ['Ahmed Hassan', 'Tariq Mehmood'],
    ['Usman Khalid', 'Khalid Mahmood'],
    ['Hamza Farooq', 'Javed Iqbal'],
    ['Bilal Ahmad', 'Nadeem Ahmed'],
    ['Ahsan Ali', 'Arshad Ali'],
    ['Saad Hussain', 'Sajid Hussain'],
    ['Ayesha Noor', 'Imran Khan'],
    ['Maryam Fatima', 'Zafar Iqbal'],
    ['Hira Shahid', 'Shahid Ali']
  ],
  MED: [
    ['Hassan Raza', 'Amjad Hussain'],
    ['Abdullah Khan', 'Riaz Ahmed'],
    ['Umer Farooq', 'Waqar Ahmed'],
    ['Talha Ahmed', 'Iftikhar Ali'],
    ['Zain Ali', 'Abid Hussain'],
    ['Fahad Ahmad', 'Azhar Mehmood'],
    ['Danish Iqbal', 'Naveed Iqbal'],
    ['Fatima Zahra', 'Saleem Ahmed'],
    ['Maham Khan', 'Munir Ahmed'],
    ['Eman Noor', 'Asif Mehmood']
  ]
};

async function createGroup({ college, session, program, code, contactBase }) {
  let created = 0;
  for (let i = 1; i <= 10; i++) {
    const [studentName, fatherName] = students[code][i - 1];
    const contactNo = `03${code === 'ICS' ? '12' : '13'}${String(contactBase + i).slice(-7).padStart(7, '0')}`;
    const normalizedContactNo = normalizeContact(contactNo);

    const duplicate = await Inquiry.findOne({
      collegeId: college._id,
      $or: [
        { normalizedContactNo },
        {
          studentName: new RegExp(`^${esc(studentName)}$`, 'i'),
          fatherName: new RegExp(`^${esc(fatherName)}$`, 'i')
        }
      ]
    });
    if (duplicate) {
      throw new Error(`Seed stopped to avoid a duplicate inquiry for ${studentName}. Clear sample inquiries first or remove the duplicate record.`);
    }

    await Inquiry.create({
      collegeId: college._id,
      inquiryNo: await nextInquiryNo(college._id, session),
      studentName,
      fatherName,
      previousSchool: i % 2 ? 'Superior School Jhang' : 'Government High School Jhang',
      previousResults: resultRows(i, code),
      address: `Jhang, Punjab - Sample Address ${i}`,
      contactNo,
      normalizedContactNo,
      programId: program._id,
      academicSessionId: session._id,
      referenceType: i % 4 === 0 ? 'advertisement' : i % 4 === 1 ? 'walk_in' : i % 4 === 2 ? 'social_media' : 'other',
      referenceDetail: i % 4 === 3 ? 'Session 2026 sample seed' : undefined,
      status: 'pending',
      notes: `Sample ${program.name} inquiry for academic session ${session.name}`
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
  const session = await resolveSession(college._id);
  const [ics, medical] = await Promise.all([
    resolveProgram(college._id, 'ICS'),
    resolveProgram(college._id, 'MED')
  ]);

  if (!ics) throw new Error(`ICS program was not found in ${college.name}.`);
  if (!medical) throw new Error(`FSc Medical program was not found in ${college.name}.`);

  console.log(`College:      ${college.name}`);
  console.log(`Session:      ${session.name}`);
  console.log(`ICS:          ${ics.name} (${ics.code})`);
  console.log(`FSc Medical:  ${medical.name} (${medical.code})`);

  const contactSeed = Number(String(Date.now()).slice(-7));
  const icsCreated = await createGroup({ college, session, program: ics, code: 'ICS', contactBase: contactSeed });
  const medCreated = await createGroup({ college, session, program: medical, code: 'MED', contactBase: contactSeed + 100 });

  console.log('\n==============================================');
  console.log(' Session 2026 sample inquiries created');
  console.log('==============================================');
  console.log(`ICS:                 ${icsCreated}`);
  console.log(`FSc Medical:         ${medCreated}`);
  console.log(`Total:               ${icsCreated + medCreated}`);
  console.log('ICS vacant results:  3');
  console.log('Medical vacant:      3');
  console.log('Total vacant:        6');
  console.log('\nAll 20 inquiries are Pending and are linked to Session 2026.');
}

main()
  .catch(err => {
    console.error('\nSeed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
