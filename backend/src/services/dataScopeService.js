const TeacherAssignment = require('../models/TeacherAssignment');
const Timetable = require('../models/Timetable');
const Student = require('../models/Student');
const { toId } = require('../utils/normalize');

function hasRole(user, code) {
  return (user?.roleCodes || []).includes(code);
}

function hasAnyRole(user, codes) {
  return codes.some(code => hasRole(user, code));
}

function isPlatformOwner(user) {
  return user?.systemRole === 'platform_owner';
}

function hasFullCollegeAcademicScope(user) {
  if (isPlatformOwner(user)) return true;
  if ((user?.effectivePermissions || []).includes('*')) return true;
  return hasAnyRole(user, ['director', 'principal', 'admin', 'exam_controller']);
}

function isStudentUser(user) {
  return hasRole(user, 'student') && !!user?.linkedStudentId;
}

function isTeacherUser(user) {
  return hasRole(user, 'teacher') && !!user?.linkedEmployeeId;
}

async function teacherAssignments(user, collegeId) {
  if (!isTeacherUser(user)) return [];
  return TeacherAssignment.find({
    collegeId,
    teacherId: user.linkedEmployeeId,
    isActive: true
  }).select('_id academicSessionId programId sectionId courseId teacherId semester').lean();
}

async function academicScope(user, collegeId) {
  if (hasFullCollegeAcademicScope(user)) return { type: 'college' };

  if (isStudentUser(user)) {
    const student = await Student.findOne({ _id: user.linkedStudentId, collegeId })
      .select('_id programId sectionId academicSessionId')
      .lean();
    if (!student) return { type: 'none' };
    return {
      type: 'student',
      studentId: student._id,
      programId: student.programId,
      sectionId: student.sectionId,
      academicSessionId: student.academicSessionId
    };
  }

  if (isTeacherUser(user)) {
    const assignments = await teacherAssignments(user, collegeId);
    return {
      type: 'teacher',
      employeeId: user.linkedEmployeeId,
      assignmentIds: assignments.map(x => x._id),
      sectionIds: [...new Set(assignments.map(x => toId(x.sectionId)).filter(Boolean))],
      courseIds: [...new Set(assignments.map(x => toId(x.courseId)).filter(Boolean))],
      programIds: [...new Set(assignments.map(x => toId(x.programId)).filter(Boolean))],
      academicSessionIds: [...new Set(assignments.map(x => toId(x.academicSessionId)).filter(Boolean))]
    };
  }

  return { type: 'limited' };
}

async function canAccessTimetable(user, timetable, collegeId) {
  if (!timetable) return false;
  if (hasFullCollegeAcademicScope(user)) return true;
  if (isTeacherUser(user)) return toId(timetable.teacherId) === toId(user.linkedEmployeeId);
  if (isStudentUser(user)) {
    const student = await Student.findOne({ _id: user.linkedStudentId, collegeId }).select('sectionId').lean();
    return !!student && toId(timetable.sectionId) === toId(student.sectionId);
  }
  return false;
}

async function canAccessStudent(user, student, collegeId) {
  if (!student) return false;
  if (hasFullCollegeAcademicScope(user)) return true;
  if (isStudentUser(user)) return toId(student._id) === toId(user.linkedStudentId);
  if (isTeacherUser(user)) {
    const assignments = await teacherAssignments(user, collegeId);
    return assignments.some(a => toId(a.sectionId) === toId(student.sectionId));
  }
  // Roles such as librarian/ISA may have VIEW_STUDENTS permission and can read
  // college student directory, but write operations remain permission-protected.
  return (user?.effectivePermissions || []).includes('VIEW_STUDENTS');
}

module.exports = {
  hasRole,
  hasAnyRole,
  hasFullCollegeAcademicScope,
  isStudentUser,
  isTeacherUser,
  teacherAssignments,
  academicScope,
  canAccessTimetable,
  canAccessStudent
};
