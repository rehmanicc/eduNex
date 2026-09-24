const mongoose = require('mongoose');

const defaultInstallmentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  sequence: { type: Number, required: true, min: 1, max: 7 },
  amount: { type: Number, required: true, min: 0 },
  dueDate: { type: Date, required: true }
}, { _id: false });

const feeLineSchema = new mongoose.Schema({
  feeHeadCode: { type: String, required: true, trim: true, uppercase: true },
  amount: { type: Number, required: true, min: 0 },
  // feeType is the canonical recurrence rule. feeCycle is retained for old records.
  feeType: { type: String, enum: ['once', 'annual', 'semester', 'monthly'], default: 'monthly' },
  feeCycle: { type: String, enum: ['monthly', 'annual', 'semester', 'periodic', 'once'], default: 'monthly' },
  defaultInstallments: { type: [defaultInstallmentSchema], default: [] }
}, { _id: false });

const historySchema = new mongoose.Schema({
  action: String,
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  remarks: String,
  changes: mongoose.Schema.Types.Mixed
}, { _id: false });

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  name: { type: String, required: true, trim: true },
  academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicSession', required: true, index: true },
  programIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true }],
  feeLines: { type: [feeLineSchema], default: [] },
  totalAmount: { type: Number, min: 0, default: 0 },

  // Legacy aggregate cycle fields retained for old records. New structures define cycle per Fee Head.
  billingCycle: { type: String, enum: ['monthly', 'annual', 'semester'], default: 'monthly', index: true },
  defaultInstallments: { type: [defaultInstallmentSchema], default: [] },

  isActive: { type: Boolean, default: true },
  version: { type: Number, default: 1, min: 1 },
  parentStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure' },

  approvalStatus: {
    type: String,
    enum: ['pending_approval', 'approved', 'rejected', 'inactive'],
    default: 'pending_approval',
    index: true
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: Date,
  approvalRemarks: String,
  history: { type: [historySchema], default: [] }
}, { timestamps: true });

schema.index({ collegeId: 1, name: 1, academicSessionId: 1, version: 1 }, { unique: true });

schema.pre('validate', function(next) {
  this.totalAmount = (this.feeLines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0);

  // v3.35: Fee Structure defines amounts and cycle only. Installment schedules
  // belong to each Student Fee Package, so master structures never store them.
  let tuitionCycle = 'monthly';
  for (const line of this.feeLines || []) {
    const legacyCycle = String(line.feeCycle || '').toLowerCase();
    const feeType = String(line.feeType || (legacyCycle === 'annual' ? 'annual' : legacyCycle === 'semester' ? 'semester' : legacyCycle === 'periodic' || legacyCycle === 'once' ? 'once' : 'monthly')).toLowerCase();
    line.feeType = ['once', 'annual', 'semester', 'monthly'].includes(feeType) ? feeType : 'monthly';
    line.feeCycle = line.feeType;
    if (String(line.feeHeadCode).toUpperCase() === 'TUITION') {
      tuitionCycle = ['annual','semester'].includes(line.feeType) ? line.feeType : 'monthly';
    }
    line.defaultInstallments = [];
  }
  this.billingCycle = tuitionCycle;
  this.defaultInstallments = [];
  next();
});

module.exports = mongoose.model('FeeStructure', schema);
