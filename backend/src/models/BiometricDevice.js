const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  name: { type: String, required: true, trim: true },
  serialNumber: { type: String, trim: true, default: '' },
  deviceCode: { type: String, trim: true, uppercase: true, default: '' },
  vendor: {
    type: String,
    enum: ['zkteco', 'hikvision', 'anviz', 'essl', 'suprema', 'matrix', 'generic'],
    default: 'generic',
    index: true
  },
  model: { type: String, trim: true, default: '' },
  location: { type: String, trim: true, default: '' },
  ipAddress: { type: String, trim: true, default: '' },
  integrationType: { type: String, enum: ['push', 'poll', 'file', 'api', 'both'], default: 'both' },
  secret: { type: String, trim: true, default: '', select: false },
  isActive: { type: Boolean, default: true, index: true },
  lastSeenAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  toJSON: { transform: (_doc, ret) => { delete ret.secret; return ret; } },
  toObject: { transform: (_doc, ret) => { delete ret.secret; return ret; } }
});

schema.pre('validate', function(next) {
  if (!this.serialNumber && this.deviceCode) this.serialNumber = this.deviceCode;
  if (!this.deviceCode && this.serialNumber) this.deviceCode = String(this.serialNumber).toUpperCase();
  next();
});

schema.index(
  { collegeId: 1, serialNumber: 1 },
  { unique: true, partialFilterExpression: { serialNumber: { $type: 'string', $gt: '' } } }
);
schema.index(
  { collegeId: 1, deviceCode: 1 },
  { unique: true, partialFilterExpression: { deviceCode: { $type: 'string', $gt: '' } } }
);

module.exports = mongoose.model('BiometricDevice', schema);
