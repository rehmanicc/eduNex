const mongoose = require('mongoose');

const QUALIFICATIONS = [
  'matric',
  'intermediate',
  'bachelor',
  'graduate',
  'master',
  'mphil',
  'phd'
];

const schema = new mongoose.Schema(
  {
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true,
      index: true
    },

    employeeNo: {
      type: String,
      required: true,
      trim: true
    },

    employeeCode: {
      type: String,
      trim: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    fatherName: {
      type: String,
      required: true,
      trim: true
    },

    cnic: {
      type: String,
      required: true,
      trim: true
    },

    qualification: {
      type: String,
      enum: QUALIFICATIONS,
      required: true
    },

    mobileNo: {
      type: String,
      required: true,
      trim: true
    },

    phone: {
      type: String,
      trim: true
    },

    address: {
      type: String,
      required: true,
      trim: true
    },

    dateOfBirth: {
      type: Date,
      required: true
    },

    dob: Date,

    dateOfJoining: {
      type: Date,
      required: true
    },

    joiningDate: Date,

    category: {
      type: String,
      enum: ['academic_staff', 'non_teaching_staff'],
      required: true,
      index: true
    },

    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null
    },

    designationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation',
      required: true,
      index: true
    },

    designation: {
      type: String,
      trim: true
    },

    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true
    },

    wingType: {
      type: String,
      default: undefined
    },

    photoUrl: {
      type: String,
      trim: true,
      default: ''
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: ''
    },

    basicSalary: {
      type: Number,
      min: 0
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
);

schema.index({ collegeId: 1, employeeNo: 1 }, { unique: true });
schema.index({ collegeId: 1, cnic: 1 }, { unique: true });
schema.index({ collegeId: 1, branchId: 1, category: 1 });

schema.pre('validate', function(next) {
  if (this.employeeNo && !this.employeeCode) {
    this.employeeCode = this.employeeNo;
  }

  if (this.mobileNo) this.phone = this.mobileNo;
  else if (this.phone) this.mobileNo = this.phone;

  if (this.dateOfBirth) this.dob = this.dateOfBirth;
  else if (this.dob) this.dateOfBirth = this.dob;

  if (this.dateOfJoining) this.joiningDate = this.dateOfJoining;
  else if (this.joiningDate) this.dateOfJoining = this.joiningDate;

  if (this.category !== 'academic_staff') {
    this.subjectId = null;
  }

  next();
});

module.exports = mongoose.model('Employee', schema);
