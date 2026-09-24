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
    required: true
  },

  sectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Section',
    required: true,
    index: true
  },

  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },

  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },

  periodNumber: {
    type: Number,
    min: 1,
    required: true
  },

  // Backward compatibility.
  semester: {
    type: Number,
    min: 1
  },

  weeklyPeriods: { type: Number, min: 1, max: 30, default: 5 },

  lessonSpan: { type: Number, min: 1, max: 4, default: 1 },

  preferredRoom: { type: String, trim: true, default: '' },
  divisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TimetableDivision', default: null, index: true },
  maxLessonsPerDay: { type: Number, min: 1, max: 4, default: 1 },
  spreadAcrossWeek: { type: Boolean, default: true },

  isPrimary: {
    type: Boolean,
    default: true
  },

  isActive: {
    type: Boolean,
    default: true
  },

  startsOn: Date,
  endsOn: Date
}, { timestamps: true });

schema.pre('validate', function(next) {
  if (!this.periodNumber && this.semester) this.periodNumber = this.semester;
  if (!this.semester && this.periodNumber) this.semester = this.periodNumber;
  this.semester = this.periodNumber;
  next();
});

schema.index(
  { collegeId: 1, academicSessionId: 1, sectionId: 1, courseId: 1, teacherId: 1 },
  { unique: true }
);

module.exports = mongoose.model('TeacherAssignment', schema);
