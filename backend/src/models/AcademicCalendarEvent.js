const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicSession', default: null, index: true },
  title: { type: String, required: true, trim: true },
  type: { type: String, enum: ['holiday', 'non_working_day', 'exam_day', 'event', 'other'], default: 'holiday' },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  blocksAttendance: { type: Boolean, default: true },
  audience: {
    type: String,
    enum: ['all', 'students', 'staff', 'academic_staff', 'non_teaching_staff'],
    default: 'all',
    index: true
  },
  scopeType: {
    type: String,
    enum: ['college', 'branch', 'wing', 'program', 'section', 'employee'],
    default: 'college',
    index: true
  },
  scopeId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  description: String,
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ collegeId: 1, startDate: 1, endDate: 1, audience: 1, scopeType: 1 });
module.exports = mongoose.model('AcademicCalendarEvent', schema);
