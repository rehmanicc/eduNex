const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  timetableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Timetable', default: null, index: true },
  academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicSession', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true, index: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
  sessionDate: { type: Date, required: true, index: true },
  attendanceMode: { type: String, enum: ['once', 'twice', 'per_period'], default: 'per_period' },
  slotKey: { type: String, required: true, default: 'period' },
  scheduledStartMinutes: { type: Number, required: true },
  scheduledEndMinutes: { type: Number, required: true },
  status: { type: String, enum: ['scheduled', 'open', 'finalized', 'cancelled'], default: 'scheduled', index: true },
  openedAt: Date,
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  finalizedAt: Date,
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: String,
  notes: String
}, { timestamps: true });

schema.index({ collegeId: 1, sectionId: 1, sessionDate: 1, slotKey: 1 }, { unique: true });
// Performance indexes for attendance reporting and operational lookups.
schema.index({ collegeId: 1, sessionDate: 1, status: 1, scheduledEndMinutes: 1 });
schema.index({ collegeId: 1, teacherId: 1, sessionDate: 1 });
module.exports = mongoose.model('AttendanceSession', schema);
