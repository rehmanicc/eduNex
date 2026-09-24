const Attendance = require('../../models/Attendance');
const pushNotifications = require('../../services/pushNotificationService');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRule = require('../../models/AttendanceRule');
const AcademicCalendarEvent = require('../../models/AcademicCalendarEvent');
const Timetable = require('../../models/Timetable');
const Student = require('../../models/Student');
const Section = require('../../models/Section');
const Program = require('../../models/Program');
const College = require('../../models/College');
const StaffShift = require('../../models/StaffShift');
const StaffShiftAssignment = require('../../models/StaffShiftAssignment');
const Employee = require('../../models/Employee');
const { asDateOnly, minutesSinceMidnight } = require('../../utils/normalize');

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

async function getCollegeSettings(collegeId) {
  const college = await College.findById(collegeId).select('attendanceSettings');
  if (!college) throw httpError('College not found', 404);
  return college.attendanceSettings || {};
}

async function findAttendanceClosure(collegeId, date, context = {}) {
  const day = asDateOnly(date);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);

  const audience = context.audience || 'students';
  const audienceOptions = audience === 'students'
    ? ['all', 'students']
    : audience === 'academic_staff'
      ? ['all', 'staff', 'academic_staff']
      : audience === 'non_teaching_staff'
        ? ['all', 'staff', 'non_teaching_staff']
        : ['all', 'staff'];

  const scopeOptions = [
    { scopeType: 'college' },
    { scopeType: { $exists: false } }
  ];
  if (context.branchId) scopeOptions.push({ scopeType: 'branch', scopeId: context.branchId });
  if (context.wingId) scopeOptions.push({ scopeType: 'wing', scopeId: context.wingId });
  if (context.programId) scopeOptions.push({ scopeType: 'program', scopeId: context.programId });
  if (context.sectionId) scopeOptions.push({ scopeType: 'section', scopeId: context.sectionId });
  if (context.employeeId) scopeOptions.push({ scopeType: 'employee', scopeId: context.employeeId });

  const and = [
    { $or: [{ audience: { $in: audienceOptions } }, { audience: { $exists: false } }] },
    { $or: scopeOptions }
  ];
  if (context.academicSessionId) {
    and.push({
      $or: [
        { academicSessionId: null },
        { academicSessionId: context.academicSessionId },
        { academicSessionId: { $exists: false } }
      ]
    });
  }

  return AcademicCalendarEvent.findOne({
    collegeId,
    isActive: true,
    blocksAttendance: true,
    startDate: { $lte: end },
    endDate: { $gte: day },
    $and: and
  }).sort({ scopeType: -1 }).lean();
}

async function isAttendanceBlockedDate(collegeId, academicSessionId, date, context = {}) {
  return findAttendanceClosure(collegeId, date, { ...context, academicSessionId });
}

async function resolveStaffShift(collegeId, employeeId, date = new Date()) {
  const day = asDateOnly(date);
  const employee = await Employee.findOne({ _id: employeeId, collegeId, isActive: true }).select('category branchId').lean();
  if (!employee) return { employee: null, shift: null };

  const assignment = await StaffShiftAssignment.findOne({
    collegeId,
    employeeId,
    isActive: true,
    $and: [
      { $or: [{ effectiveFrom: null }, { effectiveFrom: { $exists: false } }, { effectiveFrom: { $lte: day } }] },
      { $or: [{ effectiveTo: null }, { effectiveTo: { $exists: false } }, { effectiveTo: { $gte: day } }] }
    ]
  }).populate('shiftId').lean();

  let shift = assignment?.shiftId && assignment.shiftId.isActive ? assignment.shiftId : null;
  if (!shift) {
    const category = employee.category === 'academic_staff' ? 'academic_staff' : 'non_teaching_staff';
    shift = await StaffShift.findOne({
      collegeId,
      isActive: true,
      $and: [
        { $or: [{ branchId: employee.branchId || null }, { branchId: null }, { branchId: { $exists: false } }] },
        { appliesTo: { $in: [category, 'all_staff'] } }
      ]
    }).sort({ isDefault: -1, branchId: -1, createdAt: 1 }).lean();
  }
  return { employee, shift };
}

async function isStaffAttendanceBlocked(collegeId, employeeId, date = new Date()) {
  const { employee } = await resolveStaffShift(collegeId, employeeId, date);
  if (!employee) return null;
  const audience = employee.category === 'academic_staff' ? 'academic_staff' : 'non_teaching_staff';
  return findAttendanceClosure(collegeId, date, {
    audience,
    branchId: employee.branchId,
    employeeId
  });
}

function mergeRuleWithLegacy(rule, legacy = {}) {
  return {
    attendanceMode: rule?.attendanceMode || 'once',
    biometricEnabled: rule?.biometricEnabled ?? legacy.biometricEnabled ?? false,
    allowManualAttendance: rule?.allowManualAttendance ?? legacy.allowManualAttendance ?? true,
    firstSessionStartMinutes: Number(rule?.firstSessionStartMinutes ?? 480),
    secondSessionStartMinutes: Number(rule?.secondSessionStartMinutes ?? 780),
    graceMinutes: Number(rule?.graceMinutes ?? legacy.graceMinutes ?? 10),
    lateAfterMinutes: Number(rule?.lateAfterMinutes ?? legacy.lateAfterMinutes ?? 10),
    absentAfterMinutes: Number(rule?.absentAfterMinutes ?? legacy.absentAfterMinutes ?? 30),
    earlyCheckInMinutes: Number(rule?.earlyCheckInMinutes ?? legacy.earlyCheckInMinutes ?? 15),
    correctionWindowMinutes: Number(rule?.correctionWindowMinutes ?? legacy.correctionWindowMinutes ?? 120),
    allowTeacherCorrectionAfterFinalize: rule?.allowTeacherCorrectionAfterFinalize ?? legacy.allowTeacherCorrectionAfterFinalize ?? false,
    scopeType: rule?.scopeType || 'college',
    scopeId: rule?.scopeId || null,
    _id: rule?._id || null
  };
}

async function resolveRuleForSection(collegeId, sectionId) {
  const section = await Section.findOne({ _id: sectionId, collegeId }).lean();
  if (!section) throw httpError('Section not found', 404);
  const program = await Program.findOne({ _id: section.programId, collegeId }).select('branchId wingId academicType').lean();
  if (!program) throw httpError('Class / Program not found', 404);

  const rules = await AttendanceRule.find({
    collegeId,
    isActive: true,
    $or: [
      { scopeType: 'college' },
      { scopeType: 'branch', scopeId: program.branchId },
      { scopeType: 'wing', scopeId: program.wingId },
      { scopeType: 'program', scopeId: program._id },
      { scopeType: 'section', scopeId: section._id }
    ]
  }).lean();

  const priority = ['section', 'program', 'wing', 'branch', 'college'];
  let rule = priority.map(type => rules.find(r => r.scopeType === type)).find(Boolean) || null;
  const legacy = await getCollegeSettings(collegeId);
  const resolved = mergeRuleWithLegacy(rule, legacy);

  // University attendance is always period based as finalized in the module rules.
  if (program.academicType === 'university') resolved.attendanceMode = 'per_period';
  return { rule: resolved, section, program };
}

function statusFromStart(startMinutes, eventTime, settings = {}) {
  const scan = minutesSinceMidnight(eventTime);
  const delta = scan - Number(startMinutes || 0);
  const grace = Number(settings.graceMinutes ?? 10);
  const lateAfter = Number(settings.lateAfterMinutes ?? grace);
  const absentAfter = Number(settings.absentAfterMinutes ?? 30);
  if (delta <= Math.max(grace, lateAfter)) return 'present';
  if (delta <= absentAfter) return 'late';
  return 'absent';
}

function calculateStatus(timetable, eventTime, settings = {}) {
  return statusFromStart(timetable.startMinutes, eventTime, settings);
}

async function resolveClass({ collegeId, sectionId, at = new Date(), academicSessionId }) {
  const { rule } = await resolveRuleForSection(collegeId, sectionId);
  const minutes = minutesSinceMidnight(at);
  const day = at.getDay();
  const early = Number(rule.earlyCheckInMinutes ?? 15);
  const after = Number((await getCollegeSettings(collegeId)).allowAfterClassScanMinutes ?? 15);
  const filter = {
    collegeId,
    sectionId,
    dayOfWeek: day,
    isActive: true,
    startMinutes: { $lte: minutes + early },
    endMinutes: { $gte: minutes - after }
  };
  if (academicSessionId) filter.academicSessionId = academicSessionId;
  const candidates = await Timetable.find(filter).sort({ startMinutes: 1 });
  if (!candidates.length) return null;
  const active = candidates.filter(t => t.startMinutes <= minutes && t.endMinutes > minutes);
  if (active.length) return active[0];
  const upcoming = candidates.filter(t => minutes < t.startMinutes && t.startMinutes - minutes <= early).sort((a, b) => a.startMinutes - b.startMinutes);
  if (upcoming.length) return upcoming[0];
  const ended = candidates.filter(t => minutes >= t.endMinutes && minutes - t.endMinutes <= after).sort((a, b) => b.endMinutes - a.endMinutes);
  return ended[0] || null;
}

function slotForRule(rule, at = new Date()) {
  if (rule.attendanceMode === 'once') {
    return { slotKey: 'daily', label: 'Daily', startMinutes: rule.firstSessionStartMinutes, endMinutes: 1439 };
  }
  if (rule.attendanceMode === 'twice') {
    const now = minutesSinceMidnight(at);
    const secondEarly = Number(rule.secondSessionStartMinutes) - Number(rule.earlyCheckInMinutes || 0);
    return now >= secondEarly
      ? { slotKey: 'second_half', label: 'Second Half', startMinutes: rule.secondSessionStartMinutes, endMinutes: 1439 }
      : { slotKey: 'first_half', label: 'First Half', startMinutes: rule.firstSessionStartMinutes, endMinutes: Math.max(rule.secondSessionStartMinutes - 1, rule.firstSessionStartMinutes + 1) };
  }
  return null;
}

async function getOrCreateSession({ collegeId, timetable = null, section = null, date, openedBy = null, autoOpen = false, slot = null, rule = null }) {
  const sessionDate = asDateOnly(date);
  const sectionId = timetable?.sectionId || section?._id;
  const academicSessionId = timetable?.academicSessionId || section?.academicSessionId;
  if (!sectionId || !academicSessionId) throw httpError('Section and Academic Session are required', 400);

  const sectionDoc = section || (sectionId ? await Section.findById(sectionId).lean() : null);
  const programDoc = sectionDoc?.programId ? await Program.findById(sectionDoc.programId).select('branchId wingId').lean() : null;
  const blocked = await isAttendanceBlockedDate(collegeId, academicSessionId, sessionDate, {
    audience: 'students',
    sectionId,
    programId: sectionDoc?.programId || null,
    branchId: programDoc?.branchId || null,
    wingId: programDoc?.wingId || null
  });
  if (blocked) throw httpError(`Attendance blocked: ${blocked.title}`, 409);

  const attendanceMode = timetable ? 'per_period' : rule?.attendanceMode || 'once';
  const slotKey = timetable ? `period:${timetable._id}` : slot?.slotKey || 'daily';
  const scheduledStartMinutes = timetable?.startMinutes ?? slot?.startMinutes ?? 0;
  const scheduledEndMinutes = timetable?.endMinutes ?? slot?.endMinutes ?? 1439;

  let session = await AttendanceSession.findOne({ collegeId, sectionId, sessionDate, slotKey });
  if (!session) {
    session = await AttendanceSession.create({
      collegeId,
      timetableId: timetable?._id || null,
      academicSessionId,
      courseId: timetable?.courseId || null,
      sectionId,
      teacherId: timetable?.teacherId || section?.classTeacherId || null,
      sessionDate,
      attendanceMode,
      slotKey,
      scheduledStartMinutes,
      scheduledEndMinutes,
      status: autoOpen ? 'open' : 'scheduled',
      openedAt: autoOpen ? new Date() : undefined,
      openedBy: autoOpen ? openedBy : undefined
    });
  } else if (autoOpen && session.status === 'scheduled') {
    session.status = 'open';
    session.openedAt = new Date();
    if (openedBy) session.openedBy = openedBy;
    await session.save();
  }
  return session;
}

async function openContext({ collegeId, sectionId, timetableId, slotKey, date, userId }) {
  const day = asDateOnly(date);
  if (timetableId) {
    const tt = await Timetable.findOne({ _id: timetableId, collegeId, isActive: true });
    if (!tt) throw httpError('Timetable not found', 404);
    return getOrCreateSession({ collegeId, timetable: tt, date: day, openedBy: userId, autoOpen: true });
  }
  const resolved = await resolveRuleForSection(collegeId, sectionId);
  const rule = resolved.rule;
  const validSlots = rule.attendanceMode === 'twice'
    ? [
        { slotKey: 'first_half', startMinutes: rule.firstSessionStartMinutes, endMinutes: Math.max(rule.secondSessionStartMinutes - 1, rule.firstSessionStartMinutes + 1) },
        { slotKey: 'second_half', startMinutes: rule.secondSessionStartMinutes, endMinutes: 1439 }
      ]
    : [{ slotKey: 'daily', startMinutes: rule.firstSessionStartMinutes, endMinutes: 1439 }];
  const slot = validSlots.find(s => s.slotKey === slotKey) || validSlots[0];
  return getOrCreateSession({ collegeId, section: resolved.section, date: day, openedBy: userId, autoOpen: true, slot, rule });
}

async function studentsForContext({ collegeId, sectionId, timetableId, slotKey, date }) {
  let session = null;
  let section = null;
  let timetable = null;
  if (timetableId) {
    timetable = await Timetable.findOne({ _id: timetableId, collegeId });
    if (!timetable) throw httpError('Timetable not found', 404);
    section = await Section.findOne({ _id: timetable.sectionId, collegeId });
    session = await AttendanceSession.findOne({ collegeId, sectionId: section._id, sessionDate: asDateOnly(date), slotKey: `period:${timetable._id}` });
  } else {
    section = await Section.findOne({ _id: sectionId, collegeId });
    if (!section) throw httpError('Section not found', 404);
    session = await AttendanceSession.findOne({ collegeId, sectionId: section._id, sessionDate: asDateOnly(date), slotKey });
  }
  const students = await Student.find({ collegeId, sectionId: section._id, status: 'active' }).select('name admissionNo rollNo fatherName').sort({ rollNo: 1, admissionNo: 1, name: 1 });
  const rows = await Attendance.find({ collegeId, sectionId: section._id, attendanceDate: asDateOnly(date), slotKey: timetable ? `period:${timetable._id}` : slotKey });
  const attendanceByStudent = {};
  rows.forEach(a => { attendanceByStudent[String(a.studentId)] = a; });
  return { students, session, attendanceByStudent };
}

async function upsertManualContext({ collegeId, sectionId, timetableId, slotKey, date, entries, markedBy }) {
  let session;
  let section;
  let timetable = null;
  let rule;

  if (timetableId) {
    timetable = await Timetable.findOne({ _id: timetableId, collegeId });
    if (!timetable) throw httpError('Timetable not found', 404);
    section = await Section.findOne({ _id: timetable.sectionId, collegeId });
    ({ rule } = await resolveRuleForSection(collegeId, section._id));
    session = await getOrCreateSession({ collegeId, timetable, date, openedBy: markedBy, autoOpen: true });
  } else {
    const resolved = await resolveRuleForSection(collegeId, sectionId);
    section = resolved.section;
    rule = resolved.rule;
    session = await openContext({ collegeId, sectionId, slotKey, date, userId: markedBy });
  }

  if (!rule.allowManualAttendance) throw httpError('Manual attendance is disabled for this scope', 403);
  if (session.status === 'cancelled') throw httpError('Cannot mark attendance for a cancelled session', 409);
  if (session.status === 'finalized') throw httpError('Attendance session is finalized. Use correction workflow.', 409);

  const validStudents = new Set((await Student.find({ collegeId, sectionId: section._id, status: 'active' }).distinct('_id')).map(String));
  const validStatuses = new Set(['present', 'late', 'absent', 'leave', 'short_leave']);
  for (const entry of entries) {
    if (!validStudents.has(String(entry.studentId))) throw httpError('Student is not in this section', 400);
    if (!validStatuses.has(entry.status)) throw httpError('Invalid attendance status', 400);
  }

  const day = asDateOnly(date);
  const ops = entries.map(e => ({ updateOne: {
    filter: { collegeId, studentId: e.studentId, sectionId: section._id, attendanceDate: day, slotKey: session.slotKey },
    update: { $set: {
      sessionId: session._id,
      academicSessionId: section.academicSessionId,
      courseId: timetable?.courseId || null,
      sectionId: section._id,
      timetableId: timetable?._id || null,
      attendanceDate: day,
      attendanceMode: session.attendanceMode,
      slotKey: session.slotKey,
      scheduledStartMinutes: session.scheduledStartMinutes,
      scheduledEndMinutes: session.scheduledEndMinutes,
      status: e.status,
      source: 'manual',
      markedBy,
      correctionReason: e.reason || null,
      isFinalized: false
    } },
    upsert: true
  }}));
  if (ops.length) await Attendance.bulkWrite(ops);
  return Attendance.find({ collegeId, sectionId: section._id, attendanceDate: day, slotKey: session.slotKey }).populate('studentId', 'name admissionNo rollNo');
}

async function finalizeContext({ collegeId, sectionId, timetableId, slotKey, date, userId }) {
  const session = await openContext({ collegeId, sectionId, timetableId, slotKey, date, userId });
  if (session.status === 'cancelled') throw httpError('Cancelled attendance session cannot be finalized', 409);
  if (session.status === 'finalized') return session;
  const students = await Student.find({ collegeId, sectionId: session.sectionId, status: 'active' }).select('_id');
  const existingIds = new Set((await Attendance.find({ collegeId, sectionId: session.sectionId, attendanceDate: asDateOnly(date), slotKey: session.slotKey }).distinct('studentId')).map(String));
  const now = new Date();
  const missing = students.filter(s => !existingIds.has(String(s._id)));
  if (missing.length) {
    await Attendance.insertMany(missing.map(s => ({
      collegeId,
      sessionId: session._id,
      academicSessionId: session.academicSessionId,
      studentId: s._id,
      courseId: session.courseId || null,
      sectionId: session.sectionId,
      timetableId: session.timetableId || null,
      attendanceDate: asDateOnly(date),
      attendanceMode: session.attendanceMode,
      slotKey: session.slotKey,
      scheduledStartMinutes: session.scheduledStartMinutes,
      scheduledEndMinutes: session.scheduledEndMinutes,
      status: 'absent',
      source: 'auto_finalize',
      markedBy: userId,
      isFinalized: true,
      finalizedAt: now
    })), { ordered: false }).catch(err => { if (err?.code !== 11000) throw err; });
  }
  await Attendance.updateMany({ collegeId, sectionId: session.sectionId, attendanceDate: asDateOnly(date), slotKey: session.slotKey }, { $set: { isFinalized: true, finalizedAt: now } });
  session.status = 'finalized';
  session.finalizedAt = now;
  session.finalizedBy = userId;
  await session.save();

  // Notify students only after the attendance session is finalized.
  const finalizedRows=await Attendance.find({
    collegeId,sectionId:session.sectionId,attendanceDate:asDateOnly(date),slotKey:session.slotKey
  }).select('studentId status').lean();
  const statusLabel={present:'Present',absent:'Absent',late:'Late',leave:'Leave',short_leave:'Short Leave'};
  await Promise.all(finalizedRows.map(row=>pushNotifications.sendToStudentIds(collegeId,[row.studentId],{
    title:'Attendance Marked',
    body:`Your attendance has been marked ${statusLabel[row.status]||row.status}.`,
    data:{type:'attendance',attendanceId:String(row._id||''),sessionId:String(session._id),status:row.status}
  }))).catch(err=>console.error('attendance_push_error',err.message));
  return session;
}

async function cancelContext({ collegeId, sectionId, timetableId, slotKey, date, userId, reason }) {
  const session = await openContext({ collegeId, sectionId, timetableId, slotKey, date, userId });
  if (session.status === 'finalized') throw httpError('Finalized attendance cannot be cancelled', 409);
  session.status = 'cancelled';
  session.cancelledAt = new Date();
  session.cancelledBy = userId;
  session.cancellationReason = reason || 'Attendance session cancelled';
  await session.save();
  return session;
}

// Backward-compatible timetable methods used by existing biometric/controller code.
async function openSession({ collegeId, timetableId, date, userId }) {
  return openContext({ collegeId, timetableId, date, userId });
}
async function upsertManual({ collegeId, timetableId, date, entries, markedBy }) {
  return upsertManualContext({ collegeId, timetableId, date, entries, markedBy });
}
async function finalizeSession({ collegeId, timetableId, date, userId }) {
  return finalizeContext({ collegeId, timetableId, date, userId });
}
async function cancelSession({ collegeId, timetableId, date, userId, reason }) {
  return cancelContext({ collegeId, timetableId, date, userId, reason });
}

async function autoFinalizeDueSessions(collegeId, now = new Date(), userId = null) {
  const legacy = await getCollegeSettings(collegeId);
  const lag = Number(legacy.autoFinalizeAfterMinutes ?? 30);
  const today = asDateOnly(now);
  const minuteNow = minutesSinceMidnight(now);
  const sessions = await AttendanceSession.find({ collegeId, sessionDate: today, status: { $in: ['scheduled', 'open'] }, scheduledEndMinutes: { $lte: minuteNow - lag } });
  const results = [];
  for (const s of sessions) {
    results.push(await finalizeContext({ collegeId, sectionId: s.sectionId, timetableId: s.timetableId || null, slotKey: s.slotKey, date: s.sessionDate, userId }));
  }
  return results;
}

async function studentsForTimetable(collegeId, timetableId, date) {
  return studentsForContext({ collegeId, timetableId, date });
}

module.exports = {
  httpError,
  getCollegeSettings,
  resolveRuleForSection,
  calculateStatus,
  statusFromStart,
  resolveClass,
  slotForRule,
  getOrCreateSession,
  openSession,
  openContext,
  upsertManual,
  upsertManualContext,
  finalizeSession,
  finalizeContext,
  cancelSession,
  cancelContext,
  autoFinalizeDueSessions,
  studentsForTimetable,
  studentsForContext,
  findAttendanceClosure,
  isAttendanceBlockedDate,
  resolveStaffShift,
  isStaffAttendanceBlocked
};
