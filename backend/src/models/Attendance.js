const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', index: true },
  academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicSession', index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true, index: true },
  timetableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Timetable', default: null, index: true },
  attendanceDate: { type: Date, required: true, index: true },
  attendanceMode: { type: String, enum: ['once', 'twice', 'per_period'], default: 'per_period' },
  slotKey: { type: String, required: true, default: 'period' },
  scheduledStartMinutes: Number,
  scheduledEndMinutes: Number,
  checkInTime: Date,
  checkOutTime: Date,
  status: { type: String, enum: ['present', 'late', 'absent', 'leave', 'short_leave', 'excused'], required: true },
  source: { type: String, enum: ['manual', 'biometric', 'hybrid_override', 'auto_finalize'], required: true },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  biometricEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricEvent' },
  biometricEventIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BiometricEvent' }],
  originalStatus: String,
  correctionReason: String,
  correctedAt: Date,
  correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isFinalized: { type: Boolean, default: false },
  finalizedAt: Date
}, { timestamps: true });

schema.index(
  { collegeId: 1, studentId: 1, sectionId: 1, attendanceDate: 1, slotKey: 1 },
  { unique: true }
);
schema.index({ collegeId: 1, sessionId: 1, studentId: 1 });
// Performance indexes for attendance reporting and operational lookups.
schema.index({ collegeId: 1, attendanceDate: 1, sectionId: 1 });
schema.index({ collegeId: 1, academicSessionId: 1, attendanceDate: 1 });
module.exports = mongoose.model('Attendance', schema);

