const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  defaultCourseType: {
    type: String,
    enum: ['theory', 'lab', 'practical', 'project'],
    default: 'theory'
  },
  isPredefined: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

schema.index({ collegeId: 1, code: 1 }, { unique: true });
schema.index({ collegeId: 1, name: 1 });

module.exports = mongoose.model('Subject', schema);
