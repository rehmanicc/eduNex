const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryBook', required: true, index: true },

  requesterType: { type: String, enum: ['student','employee'], required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },

  requestedAt: { type: Date, default: Date.now, index: true },
  expiresAt: Date,
  status: { type: String, enum: ['waiting','ready','fulfilled','cancelled','expired'], default: 'waiting', index: true },
  readyCopyId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryBookCopy' },
  fulfilledIssueId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryIssue' }
}, { timestamps: true });

schema.index({ collegeId: 1, bookId: 1, requestedAt: 1 });
schema.index(
  { collegeId: 1, bookId: 1, studentId: 1, status: 1 },
  { unique: true, partialFilterExpression: { studentId: { $exists: true }, status: { $in: ['waiting','ready'] } } }
);

module.exports = mongoose.model('LibraryReservation', schema);
