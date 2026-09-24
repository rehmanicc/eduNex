const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  scopeType: { type: String, enum: ['college', 'branch', 'wing', 'program', 'section'], required: true, index: true },
  scopeId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  attendanceMode: { type: String, enum: ['once', 'twice', 'per_period'], default: 'once' },
  biometricEnabled: { type: Boolean, default: false },
  allowManualAttendance: { type: Boolean, default: true },
  firstSessionStartMinutes: { type: Number, min: 0, max: 1439, default: 480 },
  secondSessionStartMinutes: { type: Number, min: 0, max: 1439, default: 780 },
  graceMinutes: { type: Number, min: 0, default: 10 },
  lateAfterMinutes: { type: Number, min: 0, default: 10 },
  absentAfterMinutes: { type: Number, min: 0, default: 30 },
  earlyCheckInMinutes: { type: Number, min: 0, default: 15 },
  correctionWindowMinutes: { type: Number, min: 0, default: 120 },
  allowTeacherCorrectionAfterFinalize: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index(
  { collegeId: 1, scopeType: 1, scopeId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('AttendanceRule', schema);
