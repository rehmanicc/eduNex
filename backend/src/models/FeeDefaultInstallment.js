const mongoose = require('mongoose');

const installmentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  sequence: { type: Number, required: true, min: 1, max: 7 },
  dueDate: { type: Date, required: true }
}, { _id: false });

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicSession', required: true, index: true },
  programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
  installments: { type: [installmentSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

schema.index({ collegeId: 1, academicSessionId: 1, programId: 1 }, { unique: true });

module.exports = mongoose.model('FeeDefaultInstallment', schema);
