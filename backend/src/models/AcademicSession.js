const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  name: { type: String, required: true, trim: true },

  // v3.42: Session is the common academic-year identity only.
  // Class / Program-specific dates live in SessionProgramPeriod.
  // Legacy dates remain optional for backward compatibility with old data.
  startDate: Date,
  endDate: Date,
  isCurrent: { type: Boolean, default: false }
}, { timestamps: true });
schema.index({ collegeId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('AcademicSession', schema);
