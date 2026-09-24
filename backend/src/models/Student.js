const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'College',
    required: true,
    index: true
  },

  admissionNo: {
    type: String,
    required: true
  },

  registrationNo: String,
  rollNo: String,

  name: {
    type: String,
    required: true
  },

  fatherName: String,
  guardianName: String,
  cnic: String,
  phone: String,
  email: String,
  dateOfBirth: Date,
  gender: String,
  address: String,
  photoUrl: String,

  programId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program'
  },

  sectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Section'
  },

  academicSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicSession'
  },

  currentSemester: {
    type: Number,
    min: 1,
    default: 1
  },

  // New code may treat this as academic period.
  currentPeriod: {
    type: Number,
    min: 1,
    default: 1
  },

  admissionApplicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdmissionApplication'
  },

  admissionDate: Date,

  admissionStanding: {
    type: String,
    enum: ['provisional', 'confirmed'],
    default: 'confirmed',
    index: true
  },

  resultStatus: {
    type: String,
    enum: ['awaiting_result', 'result_declared', 'verified'],
    default: 'verified'
  },

  graduationDate: Date,
  withdrawalDate: Date,
  suspendedAt: Date,
  suspensionUntil: Date,
  suspensionReason: { type: String, trim: true, default: '' },
  reactivationInstructions: { type: String, trim: true, default: '' },
  reactivatedAt: Date,

  status: {
    type: String,
    enum: [
      'active',
      'graduated',
      'alumni',
      'withdrawn',
      'suspended',
      'transferred',
      'dropped'
    ],
    default: 'active',
    index: true
  }
}, { timestamps: true });

schema.pre('validate', function(next) {
  const period =
    this.currentPeriod ||
    this.currentSemester ||
    1;

  this.currentPeriod = period;
  this.currentSemester = period;

  next();
});

schema.index(
  { collegeId: 1, admissionNo: 1 },
  { unique: true }
);

schema.index(
  { collegeId: 1, registrationNo: 1 },
  { unique: true, sparse: true }
);

// Supports section/session active-student lookups used by exams, attendance and reports.
schema.index({ collegeId: 1, sectionId: 1, academicSessionId: 1, status: 1 });
// Optimizes college/program/section student lists and active-student filters.
schema.index({ collegeId: 1, programId: 1, sectionId: 1, status: 1, name: 1 });
schema.index({ collegeId: 1, academicSessionId: 1, programId: 1, status: 1 });

module.exports =
  mongoose.model('Student', schema);
