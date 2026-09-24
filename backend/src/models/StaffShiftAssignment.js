const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffShift', required: true, index: true },
  effectiveFrom: { type: Date, default: null },
  effectiveTo: { type: Date, default: null },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ collegeId: 1, employeeId: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
module.exports = mongoose.model('StaffShiftAssignment', schema);
