const Attendance = require('../../models/Attendance');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRule = require('../../models/AttendanceRule');
const StaffAttendance = require('../../models/StaffAttendance');
const StaffShift = require('../../models/StaffShift');
const StaffShiftAssignment = require('../../models/StaffShiftAssignment');
const AcademicCalendarEvent = require('../../models/AcademicCalendarEvent');
const Timetable = require('../../models/Timetable');
const Section = require('../../models/Section');
const Program = require('../../models/Program');
const Branch = require('../../models/Branch');
const Wing = require('../../models/Wing');
const Employee = require('../../models/Employee');
const service = require('./service');
const scope = require('../../services/dataScopeService');
const { asDateOnly } = require('../../utils/normalize');
const { audit } = require('../../services/auditService');

function collegeId(req) { return req.collegeId || req.user.collegeId; }
function isFull(req) { return scope.hasFullCollegeAcademicScope(req.user); }
function attendanceManager(req) {
  if (String(req.user?.systemRole || '').toLowerCase() === 'platform_owner') return true;
  const roles = new Set([
    ...(req.user?.roleCodes || []),
    ...(req.user?.roles || []).map(role => role?.code || role?.name),
    req.user?.roleCode,
    req.user?.role,
    req.user?.designation
  ].filter(Boolean).map(code => String(code).trim().toLowerCase()));
  const perms = new Set([...(req.user?.permissions || []), ...(req.user?.effectivePermissions || [])]);
  return perms.has('*') || perms.has('CORRECT_ATTENDANCE') || roles.has('director') || roles.has('principal') || roles.has('admin');
}

function reportDateRange(req) {
  const now = new Date();
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : now;
  return { from, to };
}
function attendancePercent(row) {
  const counted = Number(row.present || 0) + Number(row.late || 0) + Number(row.absent || 0) + Number(row.leave || 0) + Number(row.short_leave || 0) + Number(row.excused || 0);
  const attended = Number(row.present || 0) + Number(row.late || 0);
  return counted ? Number((attended / counted * 100).toFixed(1)) : 0;
}

async function sectionDetails(req, sectionId) {
  return Section.findOne({ _id: sectionId, collegeId: collegeId(req) }).populate('programId', 'academicType');
}

async function canMarkSection(req, sectionId) {
  if (attendanceManager(req)) return true;
  if (!scope.isTeacherUser(req.user)) return false;
  const section = await sectionDetails(req, sectionId);
  return !!section && String(section.classTeacherId || '') === String(req.user.linkedEmployeeId || '');
}

async function canMarkContext(req, { sectionId, timetableId }) {
  if (attendanceManager(req)) return true;
  if (!scope.isTeacherUser(req.user)) return false;

  if (timetableId) {
    const tt = await Timetable.findOne({ _id: timetableId, collegeId: collegeId(req) });
    if (!tt) return false;
    const section = await sectionDetails(req, tt.sectionId);
    if (!section) return false;
    if (section.programId?.academicType === 'university') {
      return String(tt.teacherId || '') === String(req.user.linkedEmployeeId || '');
    }
    return String(section.classTeacherId || '') === String(req.user.linkedEmployeeId || '');
  }

  return canMarkSection(req, sectionId);
}

exports.contexts = async (req, res) => {
  const cid = collegeId(req);
  const date = req.query.date ? new Date(req.query.date) : new Date();
  const day = date.getDay();

  let sectionFilter = { collegeId: cid, isActive: true };
  if (scope.isTeacherUser(req.user) && !attendanceManager(req)) {
    const universityTimetableSections = await Timetable.find({
      collegeId: cid, teacherId: req.user.linkedEmployeeId, dayOfWeek: day, isActive: true
    }).distinct('sectionId');
    sectionFilter.$or = [
      { classTeacherId: req.user.linkedEmployeeId },
      { _id: { $in: universityTimetableSections } }
    ];
  } else if (!attendanceManager(req)) {
    return res.json([]);
  }

  const sections = await Section.find(sectionFilter)
    .populate({ path: 'programId', populate: ['branchId', 'wingId'] })
    .populate('academicSessionId classTeacherId')
    .sort({ name: 1 });

  const contexts = [];
  for (const section of sections) {
    const { rule, program } = await service.resolveRuleForSection(cid, section._id);
    const closure = await service.findAttendanceClosure(cid, date, {
      audience: 'students',
      academicSessionId: section.academicSessionId?._id || section.academicSessionId,
      sectionId: section._id,
      programId: program._id,
      branchId: program.branchId,
      wingId: program.wingId
    });
    if (closure) continue;
    const isUniversity = program.academicType === 'university';
    const teacherUser = scope.isTeacherUser(req.user) && !attendanceManager(req);

    if (teacherUser && isUniversity && !sectionFilter.$or) continue;
    if (teacherUser && !isUniversity && String(section.classTeacherId?._id || section.classTeacherId || '') !== String(req.user.linkedEmployeeId || '')) continue;

    if (rule.attendanceMode === 'per_period') {
      const ttFilter = { collegeId: cid, sectionId: section._id, dayOfWeek: day, isActive: true };
      if (teacherUser && isUniversity) ttFilter.teacherId = req.user.linkedEmployeeId;
      const rows = await Timetable.find(ttFilter).populate('courseId teacherId').sort({ startMinutes: 1 });
      rows.forEach(tt => contexts.push({
        key: `period:${tt._id}`, type: 'per_period', slotKey: `period:${tt._id}`,
        timetableId: tt._id, sectionId: section._id, section, program, rule,
        course: tt.courseId, teacher: tt.teacherId, startMinutes: tt.startMinutes, endMinutes: tt.endMinutes
      }));
    } else {
      if (teacherUser && String(section.classTeacherId?._id || section.classTeacherId || '') !== String(req.user.linkedEmployeeId || '')) continue;
      const slots = rule.attendanceMode === 'twice'
        ? [
            { slotKey: 'first_half', label: 'First Session', startMinutes: rule.firstSessionStartMinutes },
            { slotKey: 'second_half', label: 'Second Session', startMinutes: rule.secondSessionStartMinutes }
          ]
        : [{ slotKey: 'daily', label: 'Daily Attendance', startMinutes: rule.firstSessionStartMinutes }];
      slots.forEach(slot => contexts.push({ key: `${section._id}:${slot.slotKey}`, type: rule.attendanceMode, sectionId: section._id, section, program, rule, ...slot }));
    }
  }
  res.json(contexts);
};

exports.rosterContext = async (req, res) => {
  const allowed = await canMarkContext(req, req.query);
  if (!allowed) return res.status(403).json({ error: 'You are not authorized to view attendance for this class/section.' });
  const data = await service.studentsForContext({ collegeId: collegeId(req), sectionId: req.query.sectionId, timetableId: req.query.timetableId, slotKey: req.query.slotKey, date: req.query.date || new Date() });
  res.json({ ...data, canCorrect: attendanceManager(req) });
};

exports.openContext = async (req, res) => {
  const allowed = await canMarkContext(req, req.body);
  if (!allowed) return res.status(403).json({ error: 'You are not authorized to mark attendance for this class/section.' });
  const session = await service.openContext({ collegeId: collegeId(req), sectionId: req.body.sectionId, timetableId: req.body.timetableId, slotKey: req.body.slotKey, date: req.body.date || new Date(), userId: req.user._id });
  await audit(req, 'OPEN_ATTENDANCE_SESSION', 'AttendanceSession', session._id);
  res.json(session);
};

exports.markContext = async (req, res) => {
  const allowed = await canMarkContext(req, req.body);
  if (!allowed) return res.status(403).json({ error: 'You are not authorized to mark attendance for this class/section.' });

  const rows = await service.upsertManualContext({
    collegeId: collegeId(req), sectionId: req.body.sectionId, timetableId: req.body.timetableId,
    slotKey: req.body.slotKey, date: req.body.date || new Date(), entries: req.body.entries || [], markedBy: req.user._id
  });

  // One Save is the submission point. After submission the teacher can only view it;
  // Principal/Admin/Director use the correction workflow for later changes.
  const session = await service.finalizeContext({
    collegeId: collegeId(req), sectionId: req.body.sectionId, timetableId: req.body.timetableId,
    slotKey: req.body.slotKey, date: req.body.date || new Date(), userId: req.user._id
  });
  await audit(req, 'SUBMIT_ATTENDANCE', 'AttendanceSession', session._id, { entries: rows.length });
  res.json({ rows, session });
};

exports.finalizeContext = async (req, res) => {
  const allowed = await canMarkContext(req, req.body);
  if (!allowed) return res.status(403).json({ error: 'You are not authorized to finalize attendance for this class/section.' });
  const session = await service.finalizeContext({ collegeId: collegeId(req), sectionId: req.body.sectionId, timetableId: req.body.timetableId, slotKey: req.body.slotKey, date: req.body.date || new Date(), userId: req.user._id });
  await audit(req, 'FINALIZE_ATTENDANCE_SESSION', 'AttendanceSession', session._id);
  res.json(session);
};

exports.cancelContext = async (req, res) => {
  const session = await service.cancelContext({ collegeId: collegeId(req), sectionId: req.body.sectionId, timetableId: req.body.timetableId, slotKey: req.body.slotKey, date: req.body.date || new Date(), userId: req.user._id, reason: req.body.reason });
  await audit(req, 'CANCEL_CLASS_ATTENDANCE', 'AttendanceSession', session._id, { reason: session.cancellationReason });
  res.json(session);
};


exports.studentReport = async (req, res) => {
  const cid = collegeId(req);
  const { from, to } = reportDateRange(req);
  const q = { collegeId: cid, attendanceDate: { $gte: from, $lte: to } };
  if (req.query.sectionId) q.sectionId = req.query.sectionId;
  if (req.query.academicSessionId) q.academicSessionId = req.query.academicSessionId;

  let docs = await Attendance.find(q)
    .populate({
      path: 'studentId',
      select: 'name fatherName rollNo admissionNo programId sectionId academicSessionId status',
      populate: [
        { path: 'programId', select: 'name code' },
        { path: 'sectionId', select: 'name' },
        { path: 'academicSessionId', select: 'name' }
      ]
    })
    .populate('sectionId', 'name')
    .sort({ attendanceDate: 1 })
    .lean();

  if (req.query.programId) {
    docs = docs.filter(r => String(r.studentId?.programId?._id || r.studentId?.programId || '') === String(req.query.programId));
  }

  const byStudent = new Map();
  for (const r of docs) {
    if (!r.studentId?._id) continue;
    const id = String(r.studentId._id);
    if (!byStudent.has(id)) byStudent.set(id, {
      studentId: id,
      rollNo: r.studentId.rollNo || r.studentId.admissionNo || '—',
      name: r.studentId.name,
      fatherName: r.studentId.fatherName || '—',
      program: r.studentId.programId?.name || '—',
      section: r.studentId.sectionId?.name || r.sectionId?.name || '—',
      present: 0, late: 0, absent: 0, leave: 0, short_leave: 0, excused: 0, total: 0
    });
    const x = byStudent.get(id);
    if (Object.prototype.hasOwnProperty.call(x, r.status)) x[r.status] += 1;
    x.total += 1;
  }

  const rows = [...byStudent.values()]
    .map(x => ({ ...x, attendancePercentage: attendancePercent(x) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const summary = rows.reduce((s, r) => {
    s.students += 1; s.records += r.total; s.present += r.present; s.late += r.late; s.absent += r.absent; s.leave += r.leave; s.short_leave += r.short_leave;
    return s;
  }, { students: 0, records: 0, present: 0, late: 0, absent: 0, leave: 0, short_leave: 0 });
  summary.attendancePercentage = summary.records ? Number(((summary.present + summary.late) / summary.records * 100).toFixed(1)) : 0;
  res.json({ from, to, summary, rows });
};

exports.staffReport = async (req, res) => {
  const cid = collegeId(req);
  const { from, to } = reportDateRange(req);
  const docs = await StaffAttendance.find({ collegeId: cid, attendanceDate: { $gte: from, $lte: to } })
    .populate({
      path: 'employeeId',
      select: 'employeeNo employeeCode name designation designationId branchId category',
      populate: [
        { path: 'designationId', select: 'name' },
        { path: 'branchId', select: 'name' }
      ]
    })
    .sort({ attendanceDate: 1 })
    .lean();

  const byEmployee = new Map();
  for (const r of docs) {
    if (!r.employeeId?._id) continue;
    const id = String(r.employeeId._id);
    if (!byEmployee.has(id)) byEmployee.set(id, {
      employeeId: id,
      employeeNo: r.employeeId.employeeNo || r.employeeId.employeeCode || '—',
      name: r.employeeId.name,
      designation: r.employeeId.designationId?.name || r.employeeId.designation || '—',
      branch: r.employeeId.branchId?.name || '—',
      present: 0, late: 0, absent: 0, leave: 0, short_leave: 0, total: 0
    });
    const x = byEmployee.get(id);
    if (Object.prototype.hasOwnProperty.call(x, r.status)) x[r.status] += 1;
    x.total += 1;
  }

  const rows = [...byEmployee.values()]
    .map(x => ({ ...x, attendancePercentage: attendancePercent(x) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const summary = rows.reduce((s, r) => {
    s.staff += 1; s.records += r.total; s.present += r.present; s.late += r.late; s.absent += r.absent; s.leave += r.leave; s.short_leave += r.short_leave;
    return s;
  }, { staff: 0, records: 0, present: 0, late: 0, absent: 0, leave: 0, short_leave: 0 });
  summary.attendancePercentage = summary.records ? Number(((summary.present + summary.late) / summary.records * 100).toFixed(1)) : 0;
  res.json({ from, to, summary, rows });
};

exports.rules = async (req, res) => {
  res.json(await AttendanceRule.find({ collegeId: collegeId(req), isActive: true }).sort({ scopeType: 1, createdAt: 1 }));
};

exports.saveRule = async (req, res) => {
  const cid = collegeId(req);
  const allowedScopes = new Set(['college', 'branch', 'wing', 'section']);
  const allowedModes = new Set(['once', 'twice', 'per_period']);
  if (!allowedScopes.has(req.body.scopeType)) return res.status(400).json({ error: 'Invalid attendance rule scope' });
  if (!allowedModes.has(req.body.attendanceMode)) return res.status(400).json({ error: 'Invalid attendance mode' });
  const scopeId = req.body.scopeType === 'college' ? null : req.body.scopeId;
  if (req.body.scopeType !== 'college' && !scopeId) return res.status(400).json({ error: 'Scope selection is required' });
  const payload = {
    attendanceMode: req.body.attendanceMode,
    biometricEnabled: !!req.body.biometricEnabled,
    allowManualAttendance: req.body.allowManualAttendance !== false,
    firstSessionStartMinutes: Number(req.body.firstSessionStartMinutes ?? 480),
    secondSessionStartMinutes: Number(req.body.secondSessionStartMinutes ?? 780),
    graceMinutes: Number(req.body.graceMinutes ?? 10),
    lateAfterMinutes: Number(req.body.lateAfterMinutes ?? 10),
    absentAfterMinutes: Number(req.body.absentAfterMinutes ?? 30),
    earlyCheckInMinutes: Number(req.body.earlyCheckInMinutes ?? 15),
    correctionWindowMinutes: Number(req.body.correctionWindowMinutes ?? 120),
    allowTeacherCorrectionAfterFinalize: !!req.body.allowTeacherCorrectionAfterFinalize,
    updatedBy: req.user._id,
    isActive: true
  };
  const doc = await AttendanceRule.findOneAndUpdate(
    { collegeId: cid, scopeType: req.body.scopeType, scopeId },
    { $set: payload, $setOnInsert: { collegeId: cid, scopeType: req.body.scopeType, scopeId, createdBy: req.user._id } },
    { upsert: true, new: true, runValidators: true }
  );
  await audit(req, 'SAVE_ATTENDANCE_RULE', 'AttendanceRule', doc._id, { scopeType: doc.scopeType, scopeId: doc.scopeId, attendanceMode: doc.attendanceMode });
  res.json(doc);
};

exports.settingsOptions = async (req, res) => {
  const cid = collegeId(req);
  const [branches, wings, sections] = await Promise.all([
    Branch.find({ collegeId: cid, isActive: true }).sort({ name: 1 }),
    Wing.find({ collegeId: cid, isActive: true }).sort({ name: 1 }),
    Section.find({ collegeId: cid, isActive: true }).populate('programId academicSessionId classTeacherId').sort({ name: 1 })
  ]);
  res.json({ branches, wings, sections });
};

exports.classTeachers = async (req, res) => {
  const cid = collegeId(req);
  const [sections, teachers] = await Promise.all([
    Section.find({ collegeId: cid, isActive: true }).populate({ path: 'programId', populate: ['branchId', 'wingId'] }).populate('academicSessionId classTeacherId').sort({ name: 1 }),
    Employee.find({ collegeId: cid, isActive: true, category: 'academic_staff' }).select('employeeNo name designationId branchId').populate('designationId', 'name').sort({ name: 1 })
  ]);
  res.json({ sections, teachers });
};

exports.assignClassTeacher = async (req, res) => {
  const cid = collegeId(req);
  const section = await Section.findOne({ _id: req.params.sectionId, collegeId: cid });
  if (!section) return res.status(404).json({ error: 'Section not found' });
  if (req.body.classTeacherId) {
    const teacher = await Employee.findOne({ _id: req.body.classTeacherId, collegeId: cid, isActive: true, category: 'academic_staff' });
    if (!teacher) return res.status(400).json({ error: 'Select a valid Academic employee as Class Teacher' });
  }
  section.classTeacherId = req.body.classTeacherId || null;
  await section.save();
  await audit(req, 'ASSIGN_CLASS_TEACHER', 'Section', section._id, { classTeacherId: section.classTeacherId });
  res.json(await Section.findById(section._id).populate('programId academicSessionId classTeacherId'));
};

exports.staffList = async (req, res) => {
  const cid = collegeId(req);
  const day = asDateOnly(req.query.date || new Date());
  const [employees, attendance] = await Promise.all([
    Employee.find({ collegeId: cid, isActive: true })
      .select('employeeNo employeeCode name designation designationId branchId category')
      .populate('designationId', 'name')
      .sort({ name: 1 })
      .lean(),
    StaffAttendance.find({ collegeId: cid, attendanceDate: day }).lean()
  ]);
  const byEmployee = {};
  attendance.forEach(a => { byEmployee[String(a.employeeId)] = a; });
  res.json({ employees, attendanceByEmployee: byEmployee });
};

exports.saveStaff = async (req, res) => {
  const cid = collegeId(req);
  const day = asDateOnly(req.body.date || new Date());
  const valid = new Set(['present', 'absent', 'late', 'leave', 'short_leave']);
  const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
  const employeeIds = new Set((await Employee.find({ collegeId: cid, isActive: true }).distinct('_id')).map(String));

  // Load the day's existing rows once. Previously saveStaff issued a findOne() for
  // every submitted employee, which became increasingly expensive for whole-college attendance.
  const submittedIds = [...new Set(entries.map(e => String(e.employeeId || '')).filter(Boolean))];
  const existingRows = submittedIds.length
    ? await StaffAttendance.find({ collegeId: cid, attendanceDate: day, employeeId: { $in: submittedIds } })
      .select('employeeId source')
      .lean()
    : [];
  const existingByEmployee = new Map(existingRows.map(row => [String(row.employeeId), row]));

  const ops = [];
  for (const e of entries) {
    if (!employeeIds.has(String(e.employeeId))) return res.status(400).json({ error: 'Invalid employee in attendance list' });
    if (!valid.has(e.status)) return res.status(400).json({ error: 'Invalid staff attendance status' });
    const closure = await service.isStaffAttendanceBlocked(cid, e.employeeId, day);
    if (closure) continue;
    const existing = existingByEmployee.get(String(e.employeeId));
    const source = existing?.source === 'biometric' ? 'hybrid_override' : (existing?.source || 'manual');
    ops.push({ updateOne: { filter: { collegeId: cid, employeeId: e.employeeId, attendanceDate: day }, update: { $set: { status: e.status, source, markedBy: req.user._id, correctionReason: e.reason || (existing?.source === 'biometric' ? 'Manual correction of biometric attendance' : null) } }, upsert: true } });
  }
  if (ops.length) await StaffAttendance.bulkWrite(ops);
  res.json(await StaffAttendance.find({ collegeId: cid, attendanceDate: day }).populate('employeeId', 'employeeNo name'));
};

exports.list = async (req, res) => {
  const filter = req.tenantFilter();
  if (req.query.date) filter.attendanceDate = asDateOnly(req.query.date);
  if (req.query.sectionId) filter.sectionId = req.query.sectionId;
  if (req.query.studentId) filter.studentId = req.query.studentId;
  res.json(await Attendance.find(filter).populate('studentId', 'name admissionNo rollNo').populate('courseId', 'name code').populate('sectionId', 'name').sort({ attendanceDate: -1, createdAt: -1 }).limit(1000));
};

exports.sessions = async (req, res) => {
  const filter = req.tenantFilter();
  if (req.query.date) filter.sessionDate = asDateOnly(req.query.date);
  res.json(await AttendanceSession.find(filter).populate('courseId sectionId teacherId timetableId').sort({ sessionDate: -1, scheduledStartMinutes: 1 }).limit(1000));
};

exports.correct = async (req, res) => {
  const a = await Attendance.findOne(req.tenantFilter({ _id: req.params.id }));
  if (!a) return res.status(404).json({ error: 'Attendance not found' });
  if (!['present', 'late', 'absent', 'leave', 'short_leave'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid attendance status' });
  const previous = a.status;
  a.originalStatus = a.originalStatus || previous;
  a.status = req.body.status;
  a.correctionReason = req.body.reason || 'Authorized correction';
  a.correctedAt = new Date();
  a.correctedBy = req.user._id;
  a.source = a.source === 'biometric' ? 'hybrid_override' : a.source;
  await a.save();
  await audit(req, 'CORRECT_ATTENDANCE', 'Attendance', a._id, { from: previous, to: a.status, reason: a.correctionReason });
  res.json(a);
};

exports.autoFinalize = async (req, res) => {
  const rows = await service.autoFinalizeDueSessions(collegeId(req), new Date(), req.user._id);
  res.json({ finalized: rows.length, sessions: rows });
};

exports.calendarList = async (req, res) => {
  res.json(await AcademicCalendarEvent.find(req.tenantFilter())
    .populate('academicSessionId','name')
    .sort({ startDate: -1, createdAt: -1 }).limit(500));
};

function closurePayload(req) {
  const scopeType = req.body.scopeType || 'college';
  const allowedScopes = new Set(['college','branch','wing','program','section','employee']);
  const allowedAudiences = new Set(['all','students','staff','academic_staff','non_teaching_staff']);
  if (!allowedScopes.has(scopeType)) throw Object.assign(new Error('Invalid closure scope'), { status: 400 });
  if (!allowedAudiences.has(req.body.audience || 'all')) throw Object.assign(new Error('Invalid closure audience'), { status: 400 });
  const startDate = new Date(req.body.startDate);
  const endDate = new Date(req.body.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) throw Object.assign(new Error('Valid From and To dates are required'), { status: 400 });
  if (endDate < startDate) throw Object.assign(new Error('To date cannot be before From date'), { status: 400 });
  if (scopeType !== 'college' && !req.body.scopeId) throw Object.assign(new Error('Select the closure scope item'), { status: 400 });
  return {
    title: String(req.body.title || '').trim(),
    type: req.body.type || 'holiday',
    startDate,
    endDate,
    blocksAttendance: req.body.blocksAttendance !== false,
    audience: req.body.audience || 'all',
    scopeType,
    scopeId: scopeType === 'college' ? null : req.body.scopeId,
    academicSessionId: req.body.academicSessionId || null,
    description: String(req.body.description || '').trim(),
    isActive: req.body.isActive !== false,
    updatedBy: req.user._id
  };
}

exports.calendarCreate = async (req, res) => {
  const payload = closurePayload(req);
  if (!payload.title) return res.status(400).json({ error: 'Holiday / Closure title is required' });
  const doc = await AcademicCalendarEvent.create({ ...payload, collegeId: collegeId(req), createdBy: req.user._id });
  await audit(req, 'CREATE_ATTENDANCE_CLOSURE', 'AcademicCalendarEvent', doc._id, { title: doc.title, audience: doc.audience, scopeType: doc.scopeType });
  res.status(201).json(doc);
};

exports.calendarUpdate = async (req, res) => {
  const payload = closurePayload(req);
  if (!payload.title) return res.status(400).json({ error: 'Holiday / Closure title is required' });
  const doc = await AcademicCalendarEvent.findOneAndUpdate(req.tenantFilter({ _id: req.params.id }), { $set: payload }, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ error: 'Calendar event not found' });
  await audit(req, 'UPDATE_ATTENDANCE_CLOSURE', 'AcademicCalendarEvent', doc._id, { title: doc.title, audience: doc.audience, scopeType: doc.scopeType });
  res.json(doc);
};

exports.staffShifts = async (req,res)=>{
  res.json(await StaffShift.find({collegeId:collegeId(req),isActive:true}).populate('branchId','name code').sort({isDefault:-1,name:1}));
};

exports.saveStaffShift = async (req,res)=>{
  const cid=collegeId(req);
  const id=req.body._id||null;
  const payload={
    name:String(req.body.name||'').trim(),
    code:String(req.body.code||'').trim().toUpperCase(),
    startMinutes:Number(req.body.startMinutes),
    endMinutes:Number(req.body.endMinutes),
    graceMinutes:Number(req.body.graceMinutes??10),
    lateAfterMinutes:Number(req.body.lateAfterMinutes??10),
    absentAfterMinutes:Number(req.body.absentAfterMinutes??120),
    earlyDepartureGraceMinutes:Number(req.body.earlyDepartureGraceMinutes??10),
    minimumWorkingMinutes:Number(req.body.minimumWorkingMinutes??0),
    singlePunchPolicy:req.body.singlePunchPolicy||'present_missing_checkout',
    appliesTo:req.body.appliesTo||'all_staff',
    branchId:req.body.branchId||null,
    workingDays:Array.isArray(req.body.workingDays)?req.body.workingDays.map(Number):[1,2,3,4,5,6],
    isDefault:!!req.body.isDefault,
    isActive:true,
    updatedBy:req.user._id
  };
  if(!payload.name)return res.status(400).json({error:'Shift Name is required'});
  if(!Number.isFinite(payload.startMinutes)||!Number.isFinite(payload.endMinutes))return res.status(400).json({error:'Valid Start and End times are required'});
  if(payload.isDefault){
    await StaffShift.updateMany({collegeId:cid,appliesTo:payload.appliesTo,branchId:payload.branchId||null,isActive:true,_id:{$ne:id}},{$set:{isDefault:false}});
  }
  const doc=id
    ? await StaffShift.findOneAndUpdate({_id:id,collegeId:cid},{$set:payload},{new:true,runValidators:true})
    : await StaffShift.create({...payload,collegeId:cid,createdBy:req.user._id});
  if(!doc)return res.status(404).json({error:'Staff shift not found'});
  await audit(req,'SAVE_STAFF_SHIFT','StaffShift',doc._id,{name:doc.name,appliesTo:doc.appliesTo});
  res.json(doc);
};

exports.staffShiftAssignments = async (req,res)=>{
  const rows=await StaffShiftAssignment.find({collegeId:collegeId(req),isActive:true})
    .populate('employeeId','employeeNo employeeCode name category designation designationId branchId')
    .populate('shiftId','name code startMinutes endMinutes appliesTo')
    .sort({createdAt:1});
  res.json(rows);
};

exports.saveStaffShiftAssignment = async (req,res)=>{
  const cid=collegeId(req);
  const employee=await Employee.findOne({_id:req.body.employeeId,collegeId:cid,isActive:true});
  if(!employee)return res.status(400).json({error:'Select a valid active employee'});
  const shift=await StaffShift.findOne({_id:req.body.shiftId,collegeId:cid,isActive:true});
  if(!shift)return res.status(400).json({error:'Select a valid staff shift'});
  const doc=await StaffShiftAssignment.findOneAndUpdate(
    {collegeId:cid,employeeId:employee._id,isActive:true},
    {$set:{shiftId:shift._id,effectiveFrom:req.body.effectiveFrom||null,effectiveTo:req.body.effectiveTo||null,updatedBy:req.user._id},
     $setOnInsert:{collegeId:cid,employeeId:employee._id,createdBy:req.user._id,isActive:true}},
    {upsert:true,new:true,runValidators:true}
  );
  await audit(req,'ASSIGN_STAFF_SHIFT','StaffShiftAssignment',doc._id,{employeeId:employee._id,shiftId:shift._id});
  res.json(doc);
};

// Legacy timetable endpoints retained for compatibility.
exports.myClasses = async (req, res) => {
  const cid = collegeId(req);
  const filter = { collegeId: cid, isActive: true, dayOfWeek: req.query.day != null ? Number(req.query.day) : new Date().getDay() };
  if (scope.isTeacherUser(req.user) && !isFull(req)) filter.teacherId = req.user.linkedEmployeeId;
  res.json(await Timetable.find(filter).populate('courseId sectionId teacherId teacherAssignmentId').sort({ startMinutes: 1 }));
};
exports.roster = async (req, res) => res.json(await service.studentsForTimetable(collegeId(req), req.params.timetableId, req.query.date || new Date()));
exports.open = async (req, res) => res.json(await service.openSession({ collegeId: collegeId(req), timetableId: req.params.timetableId, date: req.body.date || new Date(), userId: req.user._id }));
exports.markManual = async (req, res) => res.json(await service.upsertManual({ collegeId: collegeId(req), timetableId: req.params.timetableId, date: req.body.date || new Date(), entries: req.body.entries || [], markedBy: req.user._id }));
exports.finalize = async (req, res) => res.json(await service.finalizeSession({ collegeId: collegeId(req), timetableId: req.params.timetableId, date: req.body.date || new Date(), userId: req.user._id }));
exports.cancel = async (req, res) => res.json(await service.cancelSession({ collegeId: collegeId(req), timetableId: req.params.timetableId, date: req.body.date || new Date(), userId: req.user._id, reason: req.body.reason }));
