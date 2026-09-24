const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true, uppercase: true },
  startMinutes: { type: Number, min: 0, max: 1439, required: true },
  endMinutes: { type: Number, min: 0, max: 1439, required: true },
  graceMinutes: { type: Number, min: 0, default: 10 },
  lateAfterMinutes: { type: Number, min: 0, default: 10 },
  absentAfterMinutes: { type: Number, min: 0, default: 120 },
  earlyDepartureGraceMinutes: { type: Number, min: 0, default: 10 },
  minimumWorkingMinutes: { type: Number, min: 0, default: 0 },
  singlePunchPolicy: {
    type: String,
    enum: ['present_missing_checkout', 'late_missing_checkout', 'exception'],
    default: 'present_missing_checkout'
  },
  appliesTo: {
    type: String,
    enum: ['all_staff', 'academic_staff', 'non_teaching_staff'],
    default: 'all_staff',
    index: true
  },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  workingDays: {
    type: [Number],
    default: [1,2,3,4,5,6],
    validate: {
      validator: arr => Array.isArray(arr) && arr.every(n => Number.isInteger(n) && n >= 0 && n <= 6),
      message: 'Working days must be numbers from 0 to 6'
    }
  },
  isDefault: { type: Boolean, default: false, index: true },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ collegeId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('StaffShift', schema);
