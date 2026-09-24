const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricDevice', required: true, index: true },
  biometricUserId: { type: String, required: true, trim: true, index: true },
  eventTime: { type: Date, required: true, index: true },
  receivedAt: { type: Date, default: Date.now },
  rawPayload: mongoose.Schema.Types.Mixed,
  processingStatus: {
    type: String,
    enum: ['pending', 'processed', 'duplicate', 'ignored', 'error'],
    default: 'pending',
    index: true
  },
  processingMessage: String,
  attendanceId: { type: mongoose.Schema.Types.ObjectId },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession' },
  eventKind: { type: String, enum: ['check_in', 'check_out', 'unknown'], default: 'unknown' },
  punchType: { type: String, enum: ['in', 'out', 'break_in', 'break_out', 'unknown'], default: 'unknown' },
  verifyMode: { type: String, trim: true, default: '' },
  source: { type: String, enum: ['file', 'api', 'push', 'poll'], default: 'file' },
  duplicateOfEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricEvent' },
  importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ collegeId: 1, deviceId: 1, biometricUserId: 1, eventTime: 1 }, { unique: true });
schema.index({ collegeId: 1, eventTime: -1, processingStatus: 1 });
module.exports = mongoose.model('BiometricEvent', schema);
