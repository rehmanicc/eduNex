module.exports = Object.freeze([
  { code: 'ADMISSION', name: 'Admission Fee', definitionSource: 'fees' },
  { code: 'REGISTRATION', name: 'Registration Fee', definitionSource: 'fees' },
  { code: 'TUITION', name: 'Tuition Fee', definitionSource: 'fees' },
  { code: 'ANNUAL_FUND', name: 'Annual Fund', definitionSource: 'fees' },
  { code: 'EXAMINATION', name: 'Examination Fee', definitionSource: 'fees' },
  { code: 'PAPER_FUND', name: 'Paper Fund', definitionSource: 'fees' },
  { code: 'LIBRARY', name: 'Library Fee', definitionSource: 'fees' },
  { code: 'SPORTS', name: 'Sports Fund', definitionSource: 'fees' },
  { code: 'SECURITY', name: 'Security Fee', refundable: true, definitionSource: 'fees' },
  { code: 'PRACTICAL', name: 'Practical Fee', definitionSource: 'fees' },
  { code: 'ID_CARD', name: 'ID Card Fee', definitionSource: 'fees' },
  { code: 'PROSPECTUS', name: 'Prospectus / Admission Form', definitionSource: 'fees' },

  // Operational service fees are defined by their own modules. They remain
  // recognized Fee Heads so voucher generation, collection, posting, arrears,
  // receipts and reports continue to use the single Fees ledger.
  { code: 'TRANSPORT', name: 'Transport Fee', definitionSource: 'transport' },
  { code: 'HOSTEL', name: 'Hostel Fee', definitionSource: 'hostel' },

  { code: 'LATE_FEE', name: 'Late Fee / Fine', definitionSource: 'fees' },
  { code: 'MISCELLANEOUS', name: 'Miscellaneous Fee', definitionSource: 'fees' }
]);
