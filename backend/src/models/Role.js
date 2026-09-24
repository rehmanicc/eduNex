const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, lowercase: true, trim: true },
  description: String,
  permissions: { type: [String], default: [] },
  isProtected: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  definitionVersion: { type: Number, default: 0 }
}, { timestamps: true });

schema.index({ collegeId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Role', schema);
