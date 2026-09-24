const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'College',
    required: true,
    index: true
  },

  programId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
    required: true,
    index: true
  },

  academicSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicSession',
    required: true,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  periodNumber: {
    type: Number,
    min: 1,
    required: true,
    index: true
  },

  // Compatibility with admission/student lifecycle code.
  semester: {
    type: Number,
    min: 1
  },

  capacity: {
    type: Number,
    min: 1,
    default: 50
  },

  // One underlying class-teacher allocation used by Attendance, Academics and future Timetable UI.
  classTeacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null,
    index: true
  },

  // School/College sections use Boys/Girls. University sections may also
  // use Both for co-education; controller validation enforces that rule.
  genderType: {
    type: String,
    enum: ['boys', 'girls', 'both'],
    required: true,
    index: true
  },

  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

schema.pre('validate', function(next) {
  if (!this.periodNumber && this.semester) this.periodNumber = this.semester;
  if (!this.semester && this.periodNumber) this.semester = this.periodNumber;
  this.semester = this.periodNumber;
  next();
});

schema.index(
  { collegeId: 1, academicSessionId: 1, programId: 1, periodNumber: 1, name: 1 },
  { unique: true }
);

module.exports = mongoose.model('Section', schema);
