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

  // Denormalized behavior field. Wing is the source of truth.
  academicType: {
    type: String,
    enum: ['school', 'college', 'cambridge', 'university'],
    required: true,
    index: true
  },

  offeringType: {
    type: String,
    enum: ['class', 'program', 'cambridge_level'],
    required: true,
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
    trim: true,
    uppercase: true
  },

  // College and University may mix Annual and Semester programs in the same Wing.
  academicSystem: {
    type: String,
    enum: ['semester', 'annual'],
    default: 'annual',
    required: true,
    index: true
  },

  durationUnits: {
    type: Number,
    min: 1,
    required: true,
    default: 1
  },

  durationSemesters: {
    type: Number,
    min: 1
  },

  // Legacy fields retained so old records can be migrated safely.
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: false
  },
  wingType: {
    type: String,
    required: false
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, { timestamps: true });

schema.pre('validate', function(next) {
  if (this.academicType === 'school') {
    this.offeringType = 'class';
    this.academicSystem = 'annual';
    this.durationUnits = 1;
  } else if (this.academicType === 'cambridge') {
    this.offeringType = 'cambridge_level';
  } else {
    this.offeringType = 'program';
  }

  this.durationSemesters = this.durationUnits;
  next();
});

schema.index(
  { collegeId: 1, branchId: 1, wingId: 1, name: 1 },
  { unique: true }
);
schema.index(
  { collegeId: 1, branchId: 1, code: 1 },
  { unique: true }
);

module.exports = mongoose.model('Program', schema);
