const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicSession', required: true, index: true },
  teacherAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true, index: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  dayOfWeek: { type: Number, min: 0, max: 6, required: true },
  startMinutes: { type: Number, min: 0, max: 1439, required: true },
  endMinutes: { type: Number, min: 1, max: 1440, required: true },
  room: { type: String, trim: true },
  divisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TimetableDivision', default: null, index: true },
  generationStatus: { type: String, enum: ['draft','published'], default: 'draft', index: true },
  isLocked: { type: Boolean, default: false, index: true },
  source: { type: String, enum: ['manual','generated'], default: 'manual' },
  generationRunId: { type: String, trim: true, default: null, index: true },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, default: null },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

schema.pre('validate', function(next) {
  if (this.endMinutes <= this.startMinutes) {
    return next(new Error('Timetable end time must be after start time'));
  }
  next();
});

schema.index({ collegeId: 1, sectionId: 1, dayOfWeek: 1, startMinutes: 1 });
schema.index({ collegeId: 1, teacherId: 1, dayOfWeek: 1, startMinutes: 1 });
// Hot paths: timetable generation, reports, grid and publish operations.
schema.index({ collegeId: 1, academicSessionId: 1, isActive: 1, sectionId: 1 });
schema.index({ collegeId: 1, academicSessionId: 1, isActive: 1, teacherId: 1 });

module.exports = mongoose.model('Timetable', schema);
