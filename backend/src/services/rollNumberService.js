const Program = require('../models/Program');
const AcademicSession = require('../models/AcademicSession');
const seq = require('./sequenceService');

function clean(value) {
  return String(value || '').trim();
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function compact(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function genderCode(gender) {
  const g = normalize(gender);
  if (['male', 'boy', 'boys', 'm', 'b'].includes(g)) return 'B';
  if (['female', 'girl', 'girls', 'f', 'g'].includes(g)) return 'G';
  const err = new Error('Student gender must be Boy/Male or Girl/Female before Roll No can be generated.');
  err.status = 409;
  throw err;
}

function roman(number) {
  const values = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let n = Number(number);
  let out = '';
  for (const [value, symbol] of values) {
    while (n >= value) {
      out += symbol;
      n -= value;
    }
  }
  return out;
}

function classNumber(name, code) {
  const source = `${clean(name)} ${clean(code)}`;
  const m = source.match(/(?:class|grade)\s*[- ]?([1-9])\b/i) || source.match(/^\s*([1-9])\s*$/i);
  return m ? Number(m[1]) : null;
}

function isUniversityProgram(program) {
  const wing = normalize(program.wingType || program.wing || program.level || '');
  return wing === 'university' || wing.includes('university');
}

function programStoredCode(program) {
  return compact(program.code || program.programCode || program.shortCode);
}

function rollPrefix(program) {
  const name = normalize(program.name);
  const storedCode = programStoredCode(program);

  // University rule: NEVER derive/hard-code. Use Program Code stored on the Program record.
  if (isUniversityProgram(program)) {
    if (!storedCode) {
      const err = new Error('University Program Code is required before Roll No can be generated.');
      err.status = 409;
      throw err;
    }
    return storedCode;
  }

  // Pre-classes.
  if (/\bplay\s*group\b|\bplaygroup\b/.test(name)) return 'PLA';
  if (/\bnursery\b|\bnsy\b/.test(name)) return 'NSY';
  if (/\bkg\b|\bkindergarten\b/.test(name)) return 'KG';

  // School Classes 1-9 use Roman numerals.
  const number = classNumber(program.name, program.code || program.programCode);
  if (number >= 1 && number <= 9) return roman(number);

  // College / Intermediate fixed codes agreed for the system.
  const combined = `${name} ${normalize(program.code || program.programCode)}`;
  if (/f\s*sc.*medical|pre\s*medical|\bfsm\b/.test(combined)) return 'FSM';
  if (/f\s*sc.*engineering|pre\s*engineering|\bfse\b/.test(combined)) return 'FSE';
  if (/\bics\b/.test(combined)) return 'ICS';
  if (/\bi\s*com\b|\bicom\b|\bcom\b/.test(combined)) return 'COM';

  // Other configured programs: prefer their stored Program Code.
  if (storedCode) return storedCode;

  // Safe fallback for non-university pre/other classes that have no stored code.
  const letters = compact(program.name).replace(/[0-9]/g, '');
  if (letters) return letters.slice(0, 3);

  const err = new Error('Program/Class code could not be resolved for Roll No generation.');
  err.status = 409;
  throw err;
}

function sessionYear(session) {
  const candidates = [session.startYear, session.year, session.sessionYear];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 2000 && n <= 2099) return n;
    if (Number.isInteger(n) && n >= 0 && n <= 99) return 2000 + n;
  }

  if (session.startDate) {
    const date = new Date(session.startDate);
    if (!Number.isNaN(date.getTime())) return date.getFullYear();
  }

  const text = clean(session.name || session.title || session.code);
  const full = text.match(/\b(20\d{2})\b/);
  if (full) return Number(full[1]);
  const short = text.match(/(?:^|\D)(\d{2})(?:\D|$)/);
  if (short) return 2000 + Number(short[1]);

  const err = new Error('Academic Session year could not be resolved for Roll No generation.');
  err.status = 409;
  throw err;
}

async function generateRollNo({ collegeId, programId, academicSessionId, gender }) {
  const [program, session] = await Promise.all([
    Program.findOne({ _id: programId, collegeId }),
    AcademicSession.findOne({ _id: academicSessionId, collegeId })
  ]);

  if (!program) {
    const err = new Error('Program/Class not found for Roll No generation.');
    err.status = 409;
    throw err;
  }
  if (!session) {
    const err = new Error('Academic Session not found for Roll No generation.');
    err.status = 409;
    throw err;
  }

  const prefix = rollPrefix(program);
  const genderLetter = genderCode(gender);
  const year = sessionYear(session);
  const yy = String(year).slice(-2);

  // Sequence is independent per Program/Class + Session. Gender does not reset the sequence.
  const sequenceKey = `student-roll:${String(program._id)}:${year}`;
  const number = await seq.nextNumber(collegeId, sequenceKey);
  const serial = String(number).padStart(4, '0');

  return `${prefix}${genderLetter}-${yy}-${serial}`;
}

module.exports = {
  generateRollNo,
  rollPrefix,
  genderCode,
  sessionYear
};
