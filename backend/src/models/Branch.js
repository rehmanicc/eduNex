const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  address: { type: String, trim: true },
  contactNo: { type: String, trim: true },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });
schema.index({ collegeId: 1, code: 1 }, { unique: true });
schema.index({ collegeId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('Branch', schema);
