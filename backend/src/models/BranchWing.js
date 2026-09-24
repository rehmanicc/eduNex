const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'College',
    required: true,
    index: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true
  },
  wingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wing',
    required: true,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  // Legacy v3.4-v3.8 value retained only for migration/audit compatibility.
  wingType: {
    type: String,
    required: false
  }
}, { timestamps: true });

schema.index({ collegeId: 1, branchId: 1, wingId: 1 }, { unique: true });

module.exports = mongoose.model('BranchWing', schema);
