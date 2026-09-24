const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricDevice', required: true, index: true },
  biometricUserId: { type: String, required: true, trim: true },
  personType: { type: String, enum: ['student', 'teacher', 'staff'], required: true },
  personId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ collegeId: 1, deviceId: 1, biometricUserId: 1 }, { unique: true });
schema.index({ collegeId: 1, deviceId: 1, personType: 1, personId: 1 }, { unique: true });
module.exports = mongoose.model('BiometricIdentity', schema);
