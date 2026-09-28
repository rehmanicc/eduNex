const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  teacherAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true, index: true },
  academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicSession', required: true, index: true },
  programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, trim: true, required: true, maxlength: 160 },
  instructions: { type: String, trim: true, required: true, maxlength: 4000 },
  assignedAt: { type: Date, default: Date.now, index: true },
  // Date-only key keeps expiry aligned with the institution day. eduNex currently
  // operates in Pakistan, so active filtering uses Asia/Karachi calendar dates.
  dueDateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

schema.index({ collegeId:1, sectionId:1, academicSessionId:1, dueDateKey:1, isActive:1 });
schema.index({ collegeId:1, teacherId:1, createdAt:-1 });

module.exports = mongoose.model('Assignment', schema);
