const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryBook', required: true, index: true },
  copyId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryBookCopy', required: true, index: true },

  borrowerType: { type: String, enum: ['student','employee'], required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },

  issuedAt: { type: Date, default: Date.now, index: true },
  dueAt: { type: Date, required: true, index: true },
  returnedAt: Date,

  status: {
    type: String,
    enum: ['issued','returned','overdue','lost','damaged'],
    default: 'issued',
    index: true
  },

  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  renewalCount: { type: Number, default: 0 },
  fineAmount: { type: Number, min: 0, default: 0 },
  finePaid: { type: Number, min: 0, default: 0 },
  fineWaived: { type: Number, min: 0, default: 0 },
  fineStatus: { type: String, enum: ['none','unpaid','partial','paid','waived'], default: 'none' },

  notes: String
}, { timestamps: true });

schema.index({ collegeId: 1, copyId: 1, status: 1 });
schema.index({ collegeId: 1, studentId: 1, status: 1 });
schema.index({ collegeId: 1, employeeId: 1, status: 1 });

// Optimization index for common operational queries.
schema.index({ collegeId: 1, status: 1, dueAt: 1 });
module.exports = mongoose.model('LibraryIssue', schema);
