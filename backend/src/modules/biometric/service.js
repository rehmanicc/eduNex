const BiometricIdentity = require('../../models/BiometricIdentity');
const BiometricEvent = require('../../models/BiometricEvent');
const Student = require('../../models/Student');
const Employee = require('../../models/Employee');
const Attendance = require('../../models/Attendance');
const StaffAttendance = require('../../models/StaffAttendance');
const College = require('../../models/College');
const { asDateOnly } = require('../../utils/normalize');
const attendanceService = require('../attendance/service');

function normalizePunchType(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['0','in','check in','check-in','checkin','i'].includes(raw)) return 'in';
  if (['1','out','check out','check-out','checkout','o'].includes(raw)) return 'out';
  if (['2','break out','break-out'].includes(raw)) return 'break_out';
  if (['3','break in','break-in'].includes(raw)) return 'break_in';
  return 'unknown';
}

function parseEventTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = text
    .replace(/\//g, '-')
    .replace(/^(\d{2})-(\d{2})-(\d{4})(\s|$)/, '$3-$2-$1$4');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}


async function markEvent(event, status, message, extra = {}) {
  event.processingStatus = status;
  event.processingMessage = message;
  Object.assign(event, extra);
  await event.save();
  return event;
}

async function duplicateEvent(event, settings) {
  const duplicateWindowMs = Number(settings.duplicateScanWindowSeconds ?? 60) * 1000;
  return BiometricEvent.findOne({
    _id: { $ne: event._id },
    collegeId: event.collegeId,
    deviceId: event.deviceId,
    biometricUserId: event.biometricUserId,
    eventTime: { $gte: new Date(event.eventTime.getTime() - duplicateWindowMs), $lte: event.eventTime },
    processingStatus: { $in: ['processed', 'duplicate'] }
  }).sort({ eventTime: -1 });
}

async function processStudent(event, identity, settings) {
  const student = await Student.findOne({ _id: identity.personId, collegeId: event.collegeId, status: 'active' });
  if (!student || !student.sectionId) return markEvent(event, 'ignored', 'Student/section unavailable');

  const resolved = await attendanceService.resolveRuleForSection(event.collegeId, student.sectionId);
  const rule = resolved.rule;
  if (!rule.biometricEnabled) return markEvent(event, 'ignored', 'Biometric attendance disabled for this class/section');

  const day = asDateOnly(event.eventTime);
  let session;
  let attendance;
  let slotKey;
  let status;
  let timetable = null;

  if (rule.attendanceMode === 'per_period') {
    timetable = await attendanceService.resolveClass({
      collegeId: event.collegeId,
      sectionId: student.sectionId,
      academicSessionId: student.academicSessionId,
      at: event.eventTime
    });
    if (!timetable) return markEvent(event, 'ignored', 'No matching timetable slot');
    session = await attendanceService.getOrCreateSession({ collegeId: event.collegeId, timetable, date: event.eventTime, autoOpen: true });
    slotKey = `period:${timetable._id}`;
    status = attendanceService.calculateStatus(timetable, event.eventTime, rule);
  } else {
    const slot = attendanceService.slotForRule(rule, event.eventTime);
    session = await attendanceService.getOrCreateSession({ collegeId: event.collegeId, section: resolved.section, date: event.eventTime, autoOpen: true, slot, rule });
    slotKey = slot.slotKey;
    status = attendanceService.statusFromStart(slot.startMinutes, event.eventTime, rule);
  }

  if (session.status === 'cancelled') return markEvent(event, 'ignored', 'Attendance session is cancelled', { sessionId: session._id });
  if (session.status === 'finalized') return markEvent(event, 'ignored', 'Attendance session already finalized', { sessionId: session._id });

  attendance = await Attendance.findOne({
    collegeId: event.collegeId,
    studentId: student._id,
    sectionId: student.sectionId,
    attendanceDate: day,
    slotKey
  });

  if (!attendance) {
    attendance = await Attendance.create({
      collegeId: event.collegeId,
      sessionId: session._id,
      academicSessionId: student.academicSessionId,
      studentId: student._id,
      courseId: timetable?.courseId || null,
      sectionId: student.sectionId,
      timetableId: timetable?._id || null,
      attendanceDate: day,
      attendanceMode: rule.attendanceMode,
      slotKey,
      scheduledStartMinutes: session.scheduledStartMinutes,
      scheduledEndMinutes: session.scheduledEndMinutes,
      checkInTime: event.eventTime,
      status,
      source: 'biometric',
      biometricEventId: event._id,
      biometricEventIds: [event._id]
    });
    return markEvent(event, 'processed', 'Biometric attendance recorded', { attendanceId: attendance._id, sessionId: session._id, eventKind: 'check_in' });
  }

  if (attendance.isFinalized) return markEvent(event, 'ignored', 'Attendance record is finalized', { attendanceId: attendance._id, sessionId: session._id });
  attendance.biometricEventIds = [...new Set([...(attendance.biometricEventIds || []).map(String), String(event._id)])];
  if (!attendance.checkInTime || event.eventTime < attendance.checkInTime) attendance.checkInTime = event.eventTime;
  if (attendance.source === 'manual') attendance.source = 'hybrid_override';
  await attendance.save();
  return markEvent(event, 'processed', 'Additional biometric scan linked', { attendanceId: attendance._id, sessionId: session._id, eventKind: 'unknown' });
}

async function processStaff(event, identity, settings) {
  const employee = await Employee.findOne({ _id: identity.personId, collegeId: event.collegeId, isActive: true });
  if (!employee) return markEvent(event, 'ignored', 'Employee unavailable');

  const closure = await attendanceService.isStaffAttendanceBlocked(event.collegeId, employee._id, event.eventTime);
  if (closure) return markEvent(event, 'ignored', `Attendance blocked: ${closure.title}`);

  const { shift } = await attendanceService.resolveStaffShift(event.collegeId, employee._id, event.eventTime);
  if (!shift) return markEvent(event, 'ignored', 'No active Staff Attendance Shift is assigned or applicable');

  const weekday = event.eventTime.getDay();
  if (Array.isArray(shift.workingDays) && shift.workingDays.length && !shift.workingDays.includes(weekday)) {
    return markEvent(event, 'ignored', `Non-working day for shift ${shift.name}`);
  }

  const day = asDateOnly(event.eventTime);
  let attendance = await StaffAttendance.findOne({ collegeId: event.collegeId, employeeId: employee._id, attendanceDate: day });

  const eventMinutes = event.eventTime.getHours() * 60 + event.eventTime.getMinutes();
  const startMinutes = Number(shift.startMinutes);
  const graceMinutes = Number(shift.graceMinutes ?? 10);
  const lateAfterMinutes = Number(shift.lateAfterMinutes ?? graceMinutes);
  const absentAfterMinutes = Number(shift.absentAfterMinutes ?? 120);

  if (!attendance) {
    const delta = eventMinutes - startMinutes;
    const status = delta <= Math.max(graceMinutes, lateAfterMinutes) ? 'present' : (delta <= absentAfterMinutes ? 'late' : 'absent');
    attendance = await StaffAttendance.create({
      collegeId: event.collegeId,
      employeeId: employee._id,
      attendanceDate: day,
      status,
      checkInTime: event.eventTime,
      source: 'biometric',
      attendanceShiftId: shift._id,
      scheduledStartMinutes: shift.startMinutes,
      scheduledEndMinutes: shift.endMinutes,
      missingCheckOut: true,
      biometricEventIds: [event._id]
    });
    return markEvent(event, 'processed', `Staff biometric check-in recorded against ${shift.name}`, { attendanceId: attendance._id, eventKind: 'check_in' });
  }

  if (attendance.isFinalized) return markEvent(event, 'ignored', 'Staff attendance is finalized', { attendanceId: attendance._id });

  if (!attendance.checkInTime || event.eventTime < attendance.checkInTime) attendance.checkInTime = event.eventTime;
  if (!attendance.checkOutTime || event.eventTime > attendance.checkOutTime) attendance.checkOutTime = event.eventTime;
  attendance.biometricEventIds = [...new Set([...(attendance.biometricEventIds || []).map(String), String(event._id)])];
  attendance.attendanceShiftId = shift._id;
  attendance.scheduledStartMinutes = shift.startMinutes;
  attendance.scheduledEndMinutes = shift.endMinutes;

  const checkIn = attendance.checkInTime || event.eventTime;
  const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
  const delta = checkInMinutes - startMinutes;
  const calculatedStatus = delta <= Math.max(graceMinutes, lateAfterMinutes) ? 'present' : (delta <= absentAfterMinutes ? 'late' : 'absent');

  if (attendance.checkInTime && attendance.checkOutTime) {
    attendance.workingMinutes = Math.max(0, Math.round((attendance.checkOutTime - attendance.checkInTime) / 60000));
    const checkoutMinutes = attendance.checkOutTime.getHours() * 60 + attendance.checkOutTime.getMinutes();
    attendance.isEarlyDeparture =
      checkoutMinutes < Number(shift.endMinutes) - Number(shift.earlyDepartureGraceMinutes ?? 10) ||
      (Number(shift.minimumWorkingMinutes || 0) > 0 && attendance.workingMinutes < Number(shift.minimumWorkingMinutes));
    attendance.missingCheckOut = false;
  } else {
    attendance.missingCheckOut = true;
  }

  if (attendance.source !== 'hybrid_override' && !(attendance.source === 'manual' && ['leave','short_leave'].includes(attendance.status))) {
    attendance.status = calculatedStatus;
    attendance.source = 'biometric';
  }
  await attendance.save();
  return markEvent(event, 'processed', `Staff biometric punch linked against ${shift.name}`, { attendanceId: attendance._id, eventKind: 'check_out' });
}

async function processEvent(event) {
  try {
    const college = await College.findById(event.collegeId).select('attendanceSettings');
    if (!college) return markEvent(event, 'error', 'College not found');
    const settings = college.attendanceSettings || {};

    const identity = await BiometricIdentity.findOne({
      collegeId: event.collegeId,
      deviceId: event.deviceId,
      biometricUserId: event.biometricUserId,
      isActive: true
    });
    if (!identity) return markEvent(event, 'ignored', 'No active biometric identity');

    const recent = await duplicateEvent(event, settings);
    if (recent) return markEvent(event, 'duplicate', 'Duplicate scan ignored', { duplicateOfEventId: recent._id });

    if (identity.personType === 'student') return processStudent(event, identity, settings);
    if (identity.personType === 'teacher' || identity.personType === 'staff') return processStaff(event, identity, settings);
    return markEvent(event, 'ignored', 'Unsupported biometric identity type');
  } catch (e) {
    return markEvent(event, 'error', e.message);
  }
}

async function ingest({ device, biometricUserId, eventTime, rawPayload, punchType = 'unknown', verifyMode = '', source = 'api', importedBy = null }) {
  const time = parseEventTime(eventTime);
  if (!time) throw Object.assign(new Error('Invalid eventTime'), { status: 400 });
  const event = await BiometricEvent.create({
    collegeId: device.collegeId,
    deviceId: device._id,
    biometricUserId: String(biometricUserId),
    eventTime: time,
    rawPayload,
    punchType: normalizePunchType(punchType),
    verifyMode: String(verifyMode || ''),
    source,
    importedBy
  });
  device.lastSeenAt = new Date();
  await device.save();
  return processEvent(event);
}

async function importRows({ device, rows, userId }) {
  if (!Array.isArray(rows) || !rows.length) throw Object.assign(new Error('No biometric rows were supplied'), { status: 400 });
  const summary = { received: rows.length, imported: 0, duplicates: 0, processed: 0, ignored: 0, error: 0, invalid: [] };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const biometricUserId = String(row.biometricUserId ?? row.userId ?? row.pin ?? '').trim();
    const eventTime = parseEventTime(row.eventTime ?? row.timestamp ?? row.dateTime);
    if (!biometricUserId || !eventTime) {
      summary.invalid.push({ row: index + 1, reason: !biometricUserId ? 'Biometric User ID missing' : 'Valid Date/Time missing' });
      continue;
    }
    try {
      const event = await ingest({
        device,
        biometricUserId,
        eventTime,
        rawPayload: row,
        punchType: row.punchType ?? row.state ?? row.status,
        verifyMode: row.verifyMode,
        source: 'file',
        importedBy: userId
      });
      summary.imported += 1;
      if (event.processingStatus === 'processed') summary.processed += 1;
      else if (event.processingStatus === 'ignored') summary.ignored += 1;
      else if (event.processingStatus === 'error') summary.error += 1;
    } catch (error) {
      if (error?.code === 11000) summary.duplicates += 1;
      else throw error;
    }
  }
  return summary;
}

module.exports = { processEvent, ingest, importRows, normalizePunchType, parseEventTime };
