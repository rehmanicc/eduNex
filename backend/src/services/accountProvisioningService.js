const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Role = require('../models/Role');
const Student = require('../models/Student');
const { seedDefaultRoles } = require('./roleService');

const DEFAULT_PASSWORD = 'user@123';
const normalizeRollNo = value => String(value || '').trim().toLowerCase();
const normalizeCnic = value => String(value || '').replace(/\D/g, '');
const studentSyntheticEmail = (collegeId, rollNo) =>
  `${String(collegeId)}.${normalizeRollNo(rollNo).replace(/[^a-z0-9]+/g, '.') || 'student'}@student.local`;

async function studentRole(collegeId) {
  await seedDefaultRoles(collegeId);
  return Role.findOne({ collegeId, code: 'student', isActive: true });
}

async function ensureStudentUser(studentOrId) {
  const student = studentOrId?._id ? studentOrId : await Student.findById(studentOrId);
  if (!student || !student.collegeId || !String(student.rollNo || '').trim()) return null;

  const collegeId = student.collegeId;
  const rollNo = String(student.rollNo).trim();
  const loginRollNo = normalizeRollNo(rollNo);
  const role = await studentRole(collegeId);
  if (!role) throw new Error('Student login role is not configured');

  let user = await User.findOne({ collegeId, linkedStudentId: student._id });
  const realEmail = String(student.email || '').trim().toLowerCase();

  if (!user) {
    // Never silently attach a different person's account to this student.
    if (realEmail) {
      const emailOwner = await User.findOne({ email: realEmail });
      if (emailOwner) throw Object.assign(new Error('Student email is already used by another login account'), { status: 409 });
    }
    const rollOwner = await User.findOne({ collegeId, loginRollNo });
    if (rollOwner) throw Object.assign(new Error('Student Roll No is already used by another login account'), { status: 409 });

    user = await User.create({
      collegeId,
      name: student.name,
      email: realEmail || studentSyntheticEmail(collegeId, rollNo),
      emailIsSynthetic: !realEmail,
      loginRollNo,
      phone: student.phone || '',
      passwordHash: await bcrypt.hash(DEFAULT_PASSWORD, 12),
      mustChangePassword: true,
      roleIds: [role._id],
      directPermissions: [],
      linkedStudentId: student._id,
      branchAccess: { mode: 'selected', branchIds: [] },
      isActive: !['graduated','alumni','withdrawn','transferred','dropped'].includes(String(student.status || 'active'))
    });
    return user;
  }

  user.name = student.name;
  user.phone = student.phone || user.phone || '';
  user.loginRollNo = loginRollNo;
  if (realEmail) {
    const emailOwner = await User.findOne({ email: realEmail, _id: { $ne: user._id } });
    if (emailOwner) throw Object.assign(new Error('Student email is already used by another login account'), { status: 409 });
    user.email = realEmail;
    user.emailIsSynthetic = false;
  } else if (user.emailIsSynthetic) {
    user.email = studentSyntheticEmail(collegeId, rollNo);
  }
  const ids = new Set((user.roleIds || []).map(String));
  ids.add(String(role._id));
  user.roleIds = [...ids];
  await user.save();
  return user;
}

async function syncStudentAccess(studentOrId) {
  const student = studentOrId?._id ? studentOrId : await Student.findById(studentOrId);
  if (!student) return null;
  let user = await User.findOne({ collegeId: student.collegeId, linkedStudentId: student._id });
  if (!user && student.rollNo) user = await ensureStudentUser(student);
  if (!user) return null;

  const finalInactive = ['graduated','alumni','withdrawn','transferred','dropped'].includes(String(student.status || ''));
  // Suspended students remain authentication-active. Portal APIs/UI use Student.status to restrict access.
  user.isActive = !finalInactive;
  await user.save();
  return user;
}

async function syncEmployeeAccess(employee) {
  if (!employee?._id) return null;
  const user = await User.findOne({ collegeId: employee.collegeId, linkedEmployeeId: employee._id });
  if (!user) return null;
  user.isActive = employee.isActive !== false;
  await user.save();
  return user;
}

module.exports = {
  DEFAULT_PASSWORD,
  normalizeRollNo,
  normalizeCnic,
  ensureStudentUser,
  syncStudentAccess,
  syncEmployeeAccess
};
