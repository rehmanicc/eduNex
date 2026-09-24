require('dotenv').config();
const mongoose = require('mongoose');

const AdmissionApplication = require('../models/AdmissionApplication');
const College = require('../models/College');

const FIXES = [
  { formNo: 'F260001', studentName: 'Ali Raza', gender: 'male' },
  { formNo: 'F260002', studentName: 'Ahmed Hassan', gender: 'male' },
  { formNo: 'F260003', studentName: 'Ayesha Noor', gender: 'female' },
  { formNo: 'F260013', studentName: 'Hassan Raza', gender: 'male' },
  { formNo: 'F260012', studentName: 'Abdullah Khan', gender: 'male' },
  { formNo: 'F260006', studentName: 'Fatima Zahra', gender: 'female' }
];

async function resolveCollege() {
  const colleges = await College.find({}).sort({ createdAt: 1 });
  if (!colleges.length) throw new Error('No college is configured.');
  if (colleges.length !== 1) {
    throw new Error(`Expected one sample college, but found ${colleges.length}. This repair intentionally stops in a multi-college database.`);
  }
  return colleges[0];
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing from backend/.env');
  await mongoose.connect(process.env.MONGO_URI);

  const college = await resolveCollege();
  console.log(`College: ${college.name}`);

  let updated = 0;
  let alreadySet = 0;
  let missing = 0;

  for (const fix of FIXES) {
    const row = await AdmissionApplication.findOne({
      collegeId: college._id,
      formNo: fix.formNo,
      studentName: fix.studentName
    });

    if (!row) {
      console.log(`NOT FOUND  ${fix.formNo}  ${fix.studentName}`);
      missing++;
      continue;
    }

    if (row.gender) {
      console.log(`UNCHANGED  ${fix.formNo}  ${fix.studentName}  gender already = ${row.gender}`);
      alreadySet++;
      continue;
    }

    row.gender = fix.gender;
    await row.save();
    console.log(`UPDATED    ${fix.formNo}  ${fix.studentName}  -> ${fix.gender}`);
    updated++;
  }

  console.log('\n==============================================');
  console.log(' Existing admission gender repair complete');
  console.log('==============================================');
  console.log(`Updated:      ${updated}`);
  console.log(`Already set:  ${alreadySet}`);
  console.log(`Not found:    ${missing}`);
  console.log('\nNo admission status, fee package, payment, balance, Form No or Roll No was changed.');
}

main()
  .catch(err => {
    console.error('\nRepair failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
