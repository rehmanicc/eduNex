const mongoose = require('mongoose');

const installmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  dueDate: Date,
  sequence: { type: Number, required: true, min: 1 },
  paidAmount: { type: Number, default: 0, min: 0 }
}, { _id: true });

const packageLineSchema = new mongoose.Schema({
  feeHeadCode: { type: String, required: true, trim: true, uppercase: true },
  standardAmount: { type: Number, required: true, min: 0 },
  discountAmount: { type: Number, min: 0, default: 0 },
  finalAmount: { type: Number, required: true, min: 0 },
  feeType: { type: String, enum: ['once', 'annual', 'semester', 'monthly'], default: 'monthly' },
  feeCycle: { type: String, enum: ['monthly', 'annual', 'semester', 'periodic', 'once'], default: 'monthly' }
}, { _id: false });

const packageHistorySchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: String,
  reason: String,
  snapshot: mongoose.Schema.Types.Mixed
}, { _id: false });

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  admissionApplicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdmissionApplication', required: true, unique: true, index: true },
  // Stable across promotions when the same Student record is carried forward.
  enrollmentKey: { type: String, trim: true, index: true },

  // Legacy package fields retained for backward compatibility with existing records.
  feePackageId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeePackage', index: true },
  feePackageVersion: Number,
  packageSnapshot: mongoose.Schema.Types.Mixed,

  feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure', index: true },
  feeStructureVersion: Number,
  structureSnapshot: mongoose.Schema.Types.Mixed,
  billingCycle: { type: String, enum: ['monthly', 'annual', 'semester'], default: 'monthly' },
  packageLines: { type: [packageLineSchema], default: [] },
  packageHistory: { type: [packageHistorySchema], default: [] },

  totalStandardAmount: { type: Number, min: 0, default: 0 },
  totalDiscount: { type: Number, min: 0, default: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  installments: { type: [installmentSchema], default: [] },

  // totalPosted can exceed the original package when later institutional charges are posted.
  totalPosted: { type: Number, default: 0, min: 0 },
  totalPaid: { type: Number, default: 0, min: 0 },
  advanceCredit: { type: Number, default: 0, min: 0 },
  balance: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['pending', 'partial', 'paid'], default: 'pending', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Common fee-ledger and bulk-voucher lookups are tenant + admission scoped.
schema.index({ collegeId: 1, admissionApplicationId: 1 });
schema.index({ collegeId: 1, feeStructureId: 1 });

schema.pre('validate', function(next) {
  if (this.packageLines && this.packageLines.length) {
    this.totalStandardAmount = this.packageLines.reduce((s, x) => s + Number(x.standardAmount || 0), 0);
    this.totalDiscount = this.packageLines.reduce((s, x) => s + Number(x.discountAmount || 0), 0);
    this.totalAmount = this.packageLines.reduce((s, x) => s + Number(x.finalAmount || 0), 0);
  }

  if (this.billingCycle === 'monthly') this.installments = [];

  if (['annual','semester'].includes(this.billingCycle) && this.installments.length) {
    const installmentTotal = this.installments.reduce((s, i) => s + Number(i.amount || 0), 0);
    const tuitionLine = (this.packageLines || []).find(x => String(x.feeHeadCode || '').toUpperCase() === 'TUITION');
    const tuitionAmount = Number(tuitionLine?.finalAmount || 0);
    if (Math.abs(installmentTotal - tuitionAmount) > 0.01) {
      return next(new Error('Installment total must equal the student Tuition Fee after discount.'));
    }
  }

  // Before posting exists, balance reflects the package. Once posting begins, it reflects posted liability.
  const liability = Number(this.totalPosted || 0) > 0 ? Number(this.totalPosted || 0) : Number(this.totalAmount || 0);
  this.balance = Math.max(0, liability - Number(this.totalPaid || 0));
  this.status = this.totalPaid <= 0 ? 'pending' : (this.balance > 0 ? 'partial' : 'paid');
  next();
});

module.exports = mongoose.model('StudentFeePlan', schema);
