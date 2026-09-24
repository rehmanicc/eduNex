require('dotenv').config();
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const AttendanceSession = require('../models/AttendanceSession');

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/college_management');
  console.log('Connected:', mongoose.connection.name);

  let count = 0;
  for await (const row of Attendance.find({ $or: [{ slotKey: { $exists: false } }, { slotKey: null }, { slotKey: 'period' }] })) {
    row.attendanceMode = row.attendanceMode || 'per_period';
    row.slotKey = row.timetableId ? `period:${row.timetableId}` : (row.slotKey || 'daily');
    if (row.status === 'excused') row.status = 'leave';
    await row.save({ validateBeforeSave: false });
    count += 1;
  }

  let sessions = 0;
  for await (const row of AttendanceSession.find({ $or: [{ slotKey: { $exists: false } }, { slotKey: null }, { slotKey: 'period' }] })) {
    row.attendanceMode = row.attendanceMode || 'per_period';
    row.slotKey = row.timetableId ? `period:${row.timetableId}` : (row.slotKey || 'daily');
    await row.save({ validateBeforeSave: false });
    sessions += 1;
  }

  const attendanceCollection = mongoose.connection.collection('attendances');
  const sessionCollection = mongoose.connection.collection('attendancesessions');
  for (const [collection, name] of [
    [attendanceCollection, 'collegeId_1_studentId_1_timetableId_1_attendanceDate_1'],
    [sessionCollection, 'collegeId_1_timetableId_1_sessionDate_1']
  ]) {
    try { await collection.dropIndex(name); console.log('Dropped old index:', name); }
    catch (e) { if (e.codeName !== 'IndexNotFound') console.log('Index drop note:', name, e.message); }
  }

  await Attendance.createIndexes();
  await AttendanceSession.createIndexes();
  console.log(`Attendance rows upgraded: ${count}`);
  console.log(`Attendance sessions upgraded: ${sessions}`);
  console.log('v3.56 Attendance migration complete.');
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
