const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'College',
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: ['academic_staff', 'non_teaching_staff'],
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  normalizedName: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  isSystemDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

schema.index(
  { collegeId: 1, normalizedName: 1 },
  { unique: true }
);

schema.pre('validate', function(next) {
  if (this.name) {
    this.name = String(this.name).trim().replace(/\s+/g, ' ');
    this.normalizedName = this.name.toLowerCase();
  }
  next();
});

module.exports = mongoose.model('Designation', schema);
