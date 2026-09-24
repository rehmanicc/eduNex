const mongoose = require('mongoose');

const postingLineSchema = new mongoose.Schema({
  feeHeadCode: { type: String, required: true, trim: true, uppercase: true },
  feeType: { type: String, enum: ['once', 'annual', 'semester', 'monthly'], default: 'monthly' },
  description: { type: String, required: true, trim: true },
  sourceType: { type: String, enum: ['scheduled', 'additional'], required: true },
  amount: { type: Number, required: true, min: 0.01 },
  paidAmount: { type: Number, default: 0, min: 0 },
  advanceApplied: { type: Number, default: 0, min: 0 },
  installmentSequence: Number,
  dueDate: Date
}, { _id: true });

const arrearSnapshotSchema = new mongoose.Schema({
  postingId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeePosting', required: true },
  lineId: { type: mongoose.Schema.Types.ObjectId, required: true },
  feeHeadCode: { type: String, required: true },
  description: String,
  outstandingAmount: { type: Number, required: true, min: 0 }
}, { _id: false });

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  admissionApplicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdmissionApplication', required: true, index: true },
  studentFeePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentFeePlan', required: true, index: true },
  voucherNo: { type: String, required: true },
  batchNo: { type: String, trim: true, index: true },
  voucherType: { type: String, enum: ['bank', 'cash'], default: 'bank', index: true },
  postingDate: { type: Date, default: Date.now },
  dueDate: Date,
  billingCycle: { type: String, enum: ['monthly', 'annual', 'semester'], required: true },
  periodKey: { type: String, required: true, trim: true },
  installmentSequence: Number,
  lines: { type: [postingLineSchema], default: [] },
  arrearsSnapshot: { type: [arrearSnapshotSchema], default: [] },
  newChargesAmount: { type: Number, default: 0, min: 0 },
  arrearsAmount: { type: Number, default: 0, min: 0 },
  voucherAmount: { type: Number, default: 0, min: 0 },
  advanceApplied: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['unpaid', 'partial', 'paid', 'cancelled'], default: 'unpaid', index: true },
  remarks: String,
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cancelledAt: Date,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: String
}, { timestamps: true });

schema.index({ collegeId: 1, voucherNo: 1 }, { unique: true });
schema.index({ collegeId: 1, studentFeePlanId: 1, periodKey: 1 });
schema.index({ collegeId: 1, studentFeePlanId: 1, status: 1, postingDate: -1 });

schema.pre('validate', function(next) {
  this.newChargesAmount = (this.lines || []).reduce((s, x) => s + Number(x.amount || 0), 0);
  this.arrearsAmount = (this.arrearsSnapshot || []).reduce((s, x) => s + Number(x.outstandingAmount || 0), 0);
  this.advanceApplied = (this.lines || []).reduce((s, x) => s + Number(x.advanceApplied || 0), 0);
  this.voucherAmount = Math.max(0, Number((this.newChargesAmount + this.arrearsAmount - this.advanceApplied).toFixed(2)));
  const lineOutstanding = (this.lines || []).reduce((s, x) => s + Math.max(0, Number(x.amount || 0) - Number(x.paidAmount || 0)), 0);
  this.status = lineOutstanding <= 0.01 ? 'paid' : (lineOutstanding < this.newChargesAmount - 0.01 ? 'partial' : 'unpaid');
  next();
});

module.exports = mongoose.model('FeePosting', schema);
