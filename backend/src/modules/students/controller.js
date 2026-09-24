const Student = require('../../models/Student');
const StudentFeePlan = require('../../models/StudentFeePlan');
const AdmissionApplication = require('../../models/AdmissionApplication');
const scope = require('../../services/dataScopeService');
const { audit } = require('../../services/auditService');
const { toId } = require('../../utils/normalize');
const Attendance = require('../../models/Attendance');
const ExamResult = require('../../models/ExamResult');
const { ensureStudentUser } = require('../../services/accountProvisioningService');
const { executePaged } = require('../../utils/pagination');

async function listFilter(req) {
  const base = req.tenantFilter();
  if (scope.hasFullCollegeAcademicScope(req.user)) return base;
  if (scope.isStudentUser(req.user)) return { ...base, _id: req.user.linkedStudentId };
  if (scope.isTeacherUser(req.user)) {
    const a = await scope.teacherAssignments(req.user, req.collegeId || req.user.collegeId);
    return { ...base, sectionId: { $in: a.map(x => x.sectionId) } };
  }
  if ((req.user.effectivePermissions || []).includes('VIEW_STUDENTS')) return base;
  return { ...base, _id: null };
}

exports.list = async (req, res) => {
  const filter = await listFilter(req);
  if (req.query.sectionId) filter.sectionId = req.query.sectionId;
  if (req.query.programId) filter.programId = req.query.programId;
  const rows = await executePaged({
    model: Student,
    filter,
    req,
    res,
    defaultLimit: 100,
    maxLimit: 500,
    buildQuery: query => query
      .populate('programId sectionId academicSessionId')
      .sort({ name: 1 })
      .lean()
  });
  // Preserve the historical safety cap for clients that have not opted into pagination.
  res.json(req.query.page !== undefined || req.query.limit !== undefined || String(req.query.paginated || '') === '1' ? rows : rows.slice(0, 1000));
};

exports.get = async (req, res) => {
  const student = await Student.findOne(req.tenantFilter({ _id: req.params.id }))
    .populate('programId sectionId academicSessionId')
    .populate('admissionApplicationId');
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!(await scope.canAccessStudent(req.user, student, req.collegeId || req.user.collegeId))) return res.status(403).json({ error: 'Access denied' });

  // Use the same StudentFeePlan record that drives Fees > Student Fee Details.
  // Older/imported students may not have Student.admissionApplicationId populated even
  // though AdmissionApplication.studentId and the fee plan are valid, so resolve both ways.
  let feeSummary = { hasPackage: false, totalPackage: 0, paid: 0, pending: 0 };
  const collegeId = req.collegeId || req.user.collegeId;
  let admissionId = student.admissionApplicationId?._id || student.admissionApplicationId || null;
  if (!admissionId) {
    const linkedAdmission = await AdmissionApplication.findOne({ collegeId, studentId: student._id }).select('_id').lean();
    admissionId = linkedAdmission?._id || null;
  }

  const planFilters = [];
  if (admissionId) planFilters.push({ admissionApplicationId: admissionId });
  planFilters.push({ enrollmentKey: `student:${student._id}` });
  const plan = await StudentFeePlan.findOne({ collegeId, $or: planFilters })
    .sort({ updatedAt: -1 })
    .select('totalAmount totalPaid')
    .lean();

  if (plan) {
    const totalPackage = Number(plan.totalAmount || 0);
    const paid = Number(plan.totalPaid || 0);
    feeSummary = {
      hasPackage: true,
      totalPackage,
      paid,
      pending: Math.max(0, totalPackage - paid)
    };
  }

  res.json({ ...student.toObject(), feeSummary });
};


exports.progress = async (req, res) => {
  const collegeId = req.collegeId || req.user.collegeId;
  const student = await Student.findOne(req.tenantFilter({ _id: req.params.id }))
    .populate('programId sectionId academicSessionId')
    .lean();
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!(await scope.canAccessStudent(req.user, student, collegeId))) return res.status(403).json({ error: 'Access denied' });

  const [attendanceRows, resultRows] = await Promise.all([
    Attendance.find({ collegeId, studentId: student._id }).sort({ attendanceDate: 1 }).lean(),
    ExamResult.find({ collegeId, studentId: student._id, publishedAt: { $ne: null } })
      .populate('examId', 'name startDate endDate academicSessionId publishedAt status')
      .populate('courseId', 'name code creditHours periodNumber')
      .sort({ publishedAt: 1 })
      .lean()
  ]);

  const attendance = { total: 0, present: 0, late: 0, absent: 0, leave: 0, short_leave: 0, excused: 0, percentage: 0 };
  const monthly = new Map();
  for (const r of attendanceRows) {
    attendance.total += 1;
    if (Object.prototype.hasOwnProperty.call(attendance, r.status)) attendance[r.status] += 1;
    const d = new Date(r.attendanceDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthly.has(key)) monthly.set(key, { month: key, total: 0, present: 0, late: 0, absent: 0, leave: 0, short_leave: 0, excused: 0 });
    const m = monthly.get(key);
    m.total += 1;
    if (Object.prototype.hasOwnProperty.call(m, r.status)) m[r.status] += 1;
  }
  attendance.percentage = attendance.total ? Number(((attendance.present + attendance.late) / attendance.total * 100).toFixed(1)) : 0;
  const attendanceTrend = [...monthly.values()].map(m => ({ ...m, percentage: m.total ? Number(((m.present + m.late) / m.total * 100).toFixed(1)) : 0 }));

  const exams = new Map();
  for (const r of resultRows) {
    const examId = String(r.examId?._id || r.examId || '');
    if (!examId) continue;
    if (!exams.has(examId)) exams.set(examId, {
      examId, name: r.examId?.name || 'Exam', publishedAt: r.examId?.publishedAt || r.publishedAt,
      totalMarks: 0, obtainedMarks: 0, failedSubjects: 0, subjects: 0, gpaCredits: 0, gpaQuality: 0
    });
    const e = exams.get(examId);
    if (r.resultStatus !== 'withheld') {
      e.subjects += 1;
      e.totalMarks += Number(r.totalMarks || 0);
      e.obtainedMarks += Number(r.marksObtained || 0);
      if (['fail', 'absent'].includes(r.resultStatus)) e.failedSubjects += 1;
      const credits = Number(r.courseId?.creditHours || 0);
      e.gpaCredits += credits;
      e.gpaQuality += Number(r.gradePoint || 0) * credits;
    }
  }
  const examTrend = [...exams.values()].map(e => ({
    ...e,
    percentage: e.totalMarks ? Number((e.obtainedMarks / e.totalMarks * 100).toFixed(2)) : 0,
    gpa: e.gpaCredits ? Number((e.gpaQuality / e.gpaCredits).toFixed(2)) : 0,
    status: e.failedSubjects ? 'FAIL' : 'PASS'
  })).sort((a, b) => new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0));

  const latestExam = examTrend.length ? examTrend[examTrend.length - 1] : null;
  const previousExam = examTrend.length > 1 ? examTrend[examTrend.length - 2] : null;
  const academicTrend = latestExam && previousExam ? Number((latestExam.percentage - previousExam.percentage).toFixed(2)) : 0;

  res.json({
    student,
    attendance,
    attendanceTrend,
    exams: examTrend,
    analysis: {
      latestExamPercentage: latestExam?.percentage || 0,
      latestExamStatus: latestExam?.status || '—',
      academicTrend,
      attendancePercentage: attendance.percentage,
      overallIndicator: attendance.percentage >= 75 && (!latestExam || latestExam.percentage >= 50) ? 'On Track' : 'Needs Attention'
    }
  });
};

exports.create = async (req, res) => {
  const student = await Student.create({ ...req.body, collegeId: req.collegeId || req.user.collegeId });
  if (student.rollNo) await ensureStudentUser(student);
  await audit(req, 'CREATE', 'Student', student._id);
  res.status(201).json(student);
};

exports.update = async (req, res) => {
  const payload = { ...req.body }; delete payload.collegeId; ['status','academicSessionId','sectionId','programId','currentSemester','admissionNo','registrationNo','admissionApplicationId','admissionDate','graduationDate','withdrawalDate'].forEach(k=>delete payload[k]);
  const student = await Student.findOneAndUpdate(req.tenantFilter({ _id: req.params.id }), payload, { new: true, runValidators: true });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (student.rollNo) await ensureStudentUser(student);
  await audit(req, 'UPDATE', 'Student', student._id, { fields: Object.keys(payload) });
  res.json(student);
};

exports.remove = async (req, res) => {
  const student = await Student.findOneAndDelete(req.tenantFilter({ _id: req.params.id }));
  if (!student) return res.status(404).json({ error: 'Student not found' });
  await audit(req, 'DELETE', 'Student', student._id);
  res.json({ message: 'Deleted' });
};

// Student Details edits only the original Admission Form profile fields.
exports.updateAdmissionProfile = async (req, res) => {
  const AdmissionApplication = require('../../models/AdmissionApplication');
  const student = await Student.findOne(req.tenantFilter({ _id: req.params.id }));
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!student.admissionApplicationId) return res.status(409).json({ error: 'This student has no linked Admission Form.' });
  const allowed = ['studentName','fatherName','address','contactNo','fatherContact','whatsappNo','email','guardianName','guardianContact','guardianRelation','previousSchool','bFormCnic','fatherCnic','bloodGroup','secondAddress','alternateContactNo','dateOfBirth','gender'];
  const payload = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) payload[key] = req.body[key];
  const app = await AdmissionApplication.findOneAndUpdate({ _id: student.admissionApplicationId, collegeId: req.collegeId || req.user.collegeId }, payload, { new: true, runValidators: true });
  if (!app) return res.status(404).json({ error: 'Linked Admission Form not found' });
  const sync = { name: app.studentName, fatherName: app.fatherName, phone: app.contactNo, email: app.email, dateOfBirth: app.dateOfBirth, gender: app.gender, address: app.address, cnic: app.bFormCnic };
  Object.assign(student, sync); await student.save();
  if (student.rollNo) await ensureStudentUser(student);
  await audit(req, 'UPDATE_ADMISSION_PROFILE', 'Student', student._id, { fields: Object.keys(payload) });
  res.json({ student, admissionApplication: app });
};
