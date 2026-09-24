export const REFERENCE_OPTIONS = [
  ['student', 'Student'],
  ['staff', 'Staff'],
  ['social_media', 'Social Media'],
  ['advertisement', 'Advertisement'],
  ['walk_in', 'Walk-in'],
  ['other', 'Other']
];

export const FILTER_OPTIONS = [
  ['studentName', 'Name'],
  ['fatherName', 'Father Name'],
  ['previousSchool', 'School'],
  ['program', 'Program'],
  ['reference', 'Reference']
];

export const blankInquiry = {
  academicSessionId: '',
  studentName: '',
  fatherName: '',
  previousSchool: '',
  address: '',
  contactNo: '',
  programId: '',
  referenceType: '',
  referenceDetail: '',
  previousResults: []
};

export const blankProfile = {
  studentName: '', fatherName: '', bFormCnic: '', fatherCnic: '',
  dateOfBirth: '', gender: '', contactNo: '', fatherContact: '',
  whatsappNo: '', bloodGroup: '', email: '', address: '', secondAddress: '',
  guardianName: '', guardianContact: '', guardianRelation: '',
  programId: '', academicSessionId: '', periodNumber: 1,
  migrationRequired: false, migrationCertificateNo: '', eligible: false, previousResults: []
};

export const inquiryStatuses = [
  ['pending', 'Pending'],
  ['not_interested', 'Not Interested'],
  ['form_submitted', 'Prospectus / Form']
];

export const admissionStatuses = [
  ['form_submitted', 'Incomplete Forms'],
  ['fee_pending', 'Fee Pending'],
  ['provisional', 'Provisional'],
  ['confirmed', 'Confirmed']
];

export function getError(error) {
  if (!error?.response) {
    return 'Server is not reachable. Please check the backend service.';
  }

  return (
    error.response.data?.error ||
    error.response.data?.message ||
    'Something went wrong.'
  );
}

export function idOf(v) {
  return v?._id || v || '';
}

function classNumber(name) {
  const match = String(name || '').match(/\bclass\s*(\d{1,2})\b/i);
  return match ? Number(match[1]) : null;
}

export function resultRules(program) {
  if (!program) return [];

  if (program.academicType === 'college') {
    return [
      { level: '9th', inquiryRequired: false },
      { level: '10th', inquiryRequired: false, confirmRequired: true, boardRollRequired: true }
    ];
  }

  if (program.academicType === 'university') {
    return [
      { level: '11th', inquiryRequired: false },
      { level: '12th', inquiryRequired: false, confirmRequired: true, boardRollRequired: true }
    ];
  }

  if (program.academicType === 'school') {
    const number = classNumber(program.name);

    if (number >= 1 && number <= 9) {
      return [{
        level: number === 1 ? 'Previous Class' : `Class ${number - 1}`,
        inquiryRequired: false
      }];
    }
  }

  return [];
}

export function emptyResult(level) {
  return {
    level,
    obtainedMarks: '',
    totalMarks: '',
    boardRollNo: ''
  };
}

export function percentageOf(result) {
  const obtained = Number(result?.obtainedMarks);
  const total = Number(result?.totalMarks);

  if (
    result?.obtainedMarks === '' ||
    result?.totalMarks === '' ||
    !Number.isFinite(obtained) ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return '';
  }

  return ((obtained / total) * 100).toFixed(2);
}

export function alignResults(existing, rules) {
  return rules.map(rule => {
    const found = (existing || []).find(
      item =>
        String(item.level || '').toLowerCase() ===
        String(rule.level).toLowerCase()
    );

    return found
      ? {
          level: rule.level,
          obtainedMarks: found.obtainedMarks ?? '',
          totalMarks: found.totalMarks ?? '',
          boardRollNo: found.boardRollNo || ''
        }
      : emptyResult(rule.level);
  });
}

export function referenceLabel(type, detail = '') {
  const label =
    REFERENCE_OPTIONS.find(([value]) => value === type)?.[1] ||
    type ||
    '—';

  const detailRequiredTypes = new Set([
    'student',
    'staff',
    'other'
  ]);

  if (detailRequiredTypes.has(type) && String(detail || '').trim()) {
    return `${label}-${String(detail).trim()}`;
  }

  return label;
}

function normalizeSearchValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function filterFieldValue(row, field) {
  if (field === 'program') return row.programId?.name || '';
  if (field === 'reference') {
    return referenceLabel(row.referenceType, row.referenceDetail);
  }
  return row[field] || '';
}

function nearestMatchScore(value, query) {
  const text = normalizeSearchValue(value);
  const term = normalizeSearchValue(query);

  if (!term) return 0;
  if (!text) return Number.POSITIVE_INFINITY;
  if (text === term) return 0;
  if (text.startsWith(term)) return 1;

  const wordIndex = text
    .split(' ')
    .findIndex(word => word.startsWith(term));
  if (wordIndex >= 0) return 2 + wordIndex;

  const containsAt = text.indexOf(term);
  if (containsAt >= 0) return 20 + containsAt;

  return Number.POSITIVE_INFINITY;
}

export function nearestMatches(rows, field, query) {
  if (!normalizeSearchValue(query)) return rows;

  return rows
    .map((row, index) => ({
      row,
      index,
      score: nearestMatchScore(filterFieldValue(row, field), query)
    }))
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(item => item.row);
}
