const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'College',
    required: true,
    index: true
  },
  academicSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicSession',
    required: true,
    index: true
  },
  programId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
    required: true,
    index: true
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

schema.pre('validate', function(next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    return next(new Error('End Date must be on or after Start Date.'));
  }
  next();
});

schema.index(
  { collegeId: 1, academicSessionId: 1, programId: 1 },
  { unique: true }
);

module.exports = mongoose.model('SessionProgramPeriod', schema);
