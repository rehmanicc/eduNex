const mongoose = require('mongoose');

const scheduleSlotSchema = new mongoose.Schema({
  // Legacy/internal compatibility only; the UI no longer asks for a Type.
  type: { type: String, enum: ['period', 'break'] },
  isBreak: { type: Boolean, default: false },
  label: { type: String, trim: true },
  periodNo: { type: Number, min: 1 },
  startTime: { type: String, trim: true },
  endTime: { type: String, trim: true }
}, { _id: false });

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  code: { type: String, trim: true },
  domain: String,
  subdomain: { type: String, lowercase: true, trim: true },
  customDomain: { type: String, lowercase: true, trim: true },
  domainVerified: { type: Boolean, default: false },

  address: { type: String, trim: true },
  contactNo: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  website: { type: String, trim: true },

  logoUrl: String,
  bannerUrl: String,
  theme: {
    preset: { type: String, default: 'classic_blue' },
    primaryColor: { type: String, default: '#1d4ed8' },
    secondaryColor: { type: String, default: '#0f172a' },
    accentColor: { type: String, default: '#38bdf8' },
    loginBackgroundUrl: String,
    faviconUrl: String
  },

  // Platform Owner controls the entitlement. Director/Admin creates the actual branches.
  branchLimit: { type: Number, min: 1, default: 1 },

  // Fees consume this value instead of repeatedly asking the user when only one mode is allowed.
  feeVoucherMode: {
    type: String,
    enum: ['cash_only', 'bank_only', 'bank_and_cash'],
    default: 'bank_and_cash'
  },

  attendanceSettings: {
    mode: { type: String, enum: ['manual','biometric','hybrid'], default: 'manual' },
    allowManualAttendance: { type: Boolean, default: true },
    biometricEnabled: { type: Boolean, default: false },
    graceMinutes: { type: Number, default: 10 },
    lateAfterMinutes: { type: Number, default: 10 },
    absentAfterMinutes: { type: Number, default: 25 },
    duplicateScanWindowSeconds: { type: Number, default: 60 },
    earlyCheckInMinutes: { type: Number, default: 15 },
    allowAfterClassScanMinutes: { type: Number, default: 15 },
    correctionWindowMinutes: { type: Number, default: 120 },
    autoFinalizeAfterMinutes: { type: Number, default: 30 },
    deviceOfflineMinutes: { type: Number, default: 5 },
    requireCheckOut: { type: Boolean, default: false },
    allowTeacherCorrectionAfterFinalize: { type: Boolean, default: false }
  },

  timetableSettings: {
    workingDays: {
      type: [String],
      enum: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
      default: ['monday','tuesday','wednesday','thursday','friday','saturday']
    },
    periodsPerDay: { type: Number, min: 1, max: 20, default: 8 },
    dayStartTime: { type: String, default: '08:00' },
    dayEndTime: { type: String, default: '14:00' },
    scheduleSlots: { type: [scheduleSlotSchema], default: [] }
  },

  enabledWings: {
    type: [String],
    enum: ['junior','middle','high','intermediate','university','cambridge'],
    default: []
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });


// Public tenant key used by the shared eduNex mobile application.
schema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string', $gt: '' } } }
);

module.exports = mongoose.model('College', schema);
