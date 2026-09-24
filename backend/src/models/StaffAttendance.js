const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  attendanceDate: { type: Date, required: true, index: true },
  status: { type: String, enum: ['present', 'absent', 'late', 'leave', 'short_leave'], required: true },
  checkInTime: Date,
  checkOutTime: Date,
  source: { type: String, enum: ['manual', 'biometric', 'hybrid_override'], default: 'manual' },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  correctionReason: String,
  attendanceShiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffShift', default: null },
  scheduledStartMinutes: { type: Number, min: 0, max: 1439, default: null },
  scheduledEndMinutes: { type: Number, min: 0, max: 1439, default: null },
  workingMinutes: { type: Number, min: 0, default: 0 },
  isEarlyDeparture: { type: Boolean, default: false },
  missingCheckOut: { type: Boolean, default: false },
  biometricEventIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BiometricEvent' }],
  isFinalized: { type: Boolean, default: false },
  finalizedAt: Date
}, { timestamps: true });

schema.index({ collegeId: 1, employeeId: 1, attendanceDate: 1 }, { unique: true });
// Performance indexes for attendance reporting and operational lookups.
schema.index({ collegeId: 1, attendanceDate: 1, status: 1 });
module.exports = mongoose.model('StaffAttendance', schema);
