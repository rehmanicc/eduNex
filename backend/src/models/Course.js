const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'College',
    required: true,
    index: true
  },

  programId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
    required: true,
    index: true
  },

  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  code: {
    type: String,
    required: true,
    trim: true
  },

  // Generic academic period.
  // Semester program: 1 = Semester 1
  // Annual program:   1 = Year 1
  periodNumber: {
    type: Number,
    min: 1,
    required: true,
    index: true
  },

  // Compatibility field used by existing exam/admission code.
  semester: {
    type: Number,
    min: 1
  },

  creditHours: {
    type: Number,
    min: 0,
    default: null
  },

  courseType: {
    type: String,
    enum: ['theory', 'lab', 'practical', 'project'],
    default: 'theory'
  },

  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

schema.pre('validate', function(next) {
  if (!this.periodNumber && this.semester) this.periodNumber = this.semester;
  if (!this.semester && this.periodNumber) this.semester = this.periodNumber;

  // Keep legacy field synchronized.
  this.semester = this.periodNumber;

  next();
});

schema.index({ collegeId: 1, programId: 1, periodNumber: 1, code: 1 }, { unique: true });
schema.index({ collegeId: 1, programId: 1, periodNumber: 1, subjectId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Course', schema);
