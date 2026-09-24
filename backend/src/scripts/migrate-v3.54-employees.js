require('dotenv').config();

const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const EmployeeSequence = require('../models/EmployeeSequence');

function parseNumber(value) {
  const text = String(value || '');
  const match = /^EMP-(\d+)$/.exec(text) || /^E(\d+)$/.exec(text);
  return match ? Number(match[1]) : null;
}

function formatEmployeeNo(number) {
  return `EMP-${String(number).padStart(2, '0')}`;
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to:', mongoose.connection.name);

    const employees = await Employee.find({})
      .sort({ collegeId: 1, createdAt: 1, _id: 1 });

    const byCollege = new Map();

    for (const employee of employees) {
      const key = String(employee.collegeId);
      if (!byCollege.has(key)) byCollege.set(key, []);
      byCollege.get(key).push(employee);
    }

    let total = 0;

    for (const [collegeId, docs] of byCollege) {
      let counter = 1;

      for (const doc of docs) {
        const parsed = parseNumber(doc.employeeNo || doc.employeeCode);
        const number = parsed || counter;
        const finalCode = formatEmployeeNo(number);

        doc.employeeNo = finalCode;
        doc.employeeCode = finalCode;

        if (!doc.mobileNo && doc.phone) doc.mobileNo = doc.phone;
        if (!doc.phone && doc.mobileNo) doc.phone = doc.mobileNo;

        if (!doc.dateOfJoining && doc.joiningDate) doc.dateOfJoining = doc.joiningDate;
        if (!doc.joiningDate && doc.dateOfJoining) doc.joiningDate = doc.dateOfJoining;

        if (!doc.dateOfBirth && doc.dob) doc.dateOfBirth = doc.dob;
        if (!doc.dob && doc.dateOfBirth) doc.dob = doc.dateOfBirth;

        if (doc.category !== 'academic_staff') doc.subjectId = null;

        await doc.save({ validateBeforeSave: false });

        counter = Math.max(counter, number + 1);
        total += 1;
      }

      const maxNumber = docs.reduce(
        (max, doc) => Math.max(max, parseNumber(doc.employeeNo) || 0),
        0
      );

      await EmployeeSequence.findOneAndUpdate(
        { collegeId },
        { $set: { lastNumber: maxNumber } },
        { upsert: true, new: true }
      );

      console.log(`College ${collegeId}: sequence set to ${maxNumber}`);
    }

    console.log(`Migrated employees: ${total}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
