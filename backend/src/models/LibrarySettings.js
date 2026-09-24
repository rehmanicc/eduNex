const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, unique: true, index: true },

  studentIssueLimit: { type: Number, min: 0, default: 3 },
  employeeIssueLimit: { type: Number, min: 0, default: 5 },

  studentLoanDays: { type: Number, min: 1, default: 14 },
  employeeLoanDays: { type: Number, min: 1, default: 30 },

  maxRenewals: { type: Number, min: 0, default: 1 },
  renewalDays: { type: Number, min: 1, default: 7 },

  finePerDay: { type: Number, min: 0, default: 10 },
  reservationHoldDays: { type: Number, min: 1, default: 2 },

  allowStudentReservation: { type: Boolean, default: true },
  allowEmployeeReservation: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('LibrarySettings', schema);
