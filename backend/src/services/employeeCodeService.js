const mongoose = require('mongoose');

async function getNextEmployeeCode({ collegeId }) {
  if (!collegeId) throw new Error('collegeId is required for employee code generation');
  const db = mongoose.connection.db;
  const key = `employee:${String(collegeId)}`;

  await db.collection('employeesequences').findOneAndUpdate(
    { key },
    {
      $inc: { value: 1 },
      $setOnInsert: {
        key,
        collegeId: new mongoose.Types.ObjectId(String(collegeId)),
        createdAt: new Date()
      },
      $set: { updatedAt: new Date() }
    },
    { upsert: true, returnDocument: 'after' }
  );

  const row = await db.collection('employeesequences').findOne({ key });
  const n = Number(row?.value || 0);
  if (!n) throw new Error('Unable to generate employee code');
  return `EMP-${String(n).padStart(2, '0')}`;
}

module.exports = { getNextEmployeeCode };
