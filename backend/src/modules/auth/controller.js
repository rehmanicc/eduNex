const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const College = require('../../models/College');
const User = require('../../models/User');
const Student = require('../../models/Student');

const DEFAULT_PASSWORD = 'user@123';

function normalizeCnic(value){return String(value||'').replace(/\D/g,'')}

function sign(user) {
  return jwt.sign(
    { sub: String(user._id), collegeId: user.collegeId ? String(user.collegeId) : null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

function dto(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.emailIsSynthetic ? '' : user.email,
    cnic: user.cnic || '',
    loginRollNo: user.loginRollNo || '',
    linkedStudentId: user.linkedStudentId || null,
    linkedEmployeeId: user.linkedEmployeeId || null,
    collegeId: user.collegeId,
    systemRole: user.systemRole || null,
    roles: (user.roleIds || []).map(role => ({ id: role._id, name: role.name, code: role.code })),
    permissions: user.effectivePermissions || [],
    branchAccess: user.branchAccess || { mode: 'all', branchIds: [] },
    mustChangePassword: Boolean(user.mustChangePassword)
  };
}

async function portalAccessFor(user) {
  if (!user?.linkedStudentId) return { state: 'normal' };
  const student = await Student.findOne({ _id: user.linkedStudentId, collegeId: user.collegeId })
    .select('status rollNo suspensionReason suspendedAt suspensionUntil reactivationInstructions')
    .lean();
  if (!student) return { state: 'unavailable', message: 'Linked student profile was not found' };
  if (student.status === 'suspended') {
    return {
      state: 'suspended',
      studentStatus: student.status,
      rollNo: student.rollNo || '',
      reason: student.suspensionReason || '',
      suspendedAt: student.suspendedAt || null,
      suspensionUntil: student.suspensionUntil || null,
      reactivationInstructions: student.reactivationInstructions || 'Contact college administration for reactivation procedure.'
    };
  }
  return { state: 'normal', studentStatus: student.status };
}

exports.login = async (req, res) => {
  const identifier = String(req.body.identifier || req.body.email || '').trim();
  const password = String(req.body.password || '');
  const collegeCode = String(req.body.collegeCode || '').trim().toUpperCase();
  if (!identifier || !password) return res.status(400).json({ error: 'Email, CNIC or Roll No and password are required' });

  let loginCollege = null;
  if (collegeCode) {
    loginCollege = await College.findOne({ code: collegeCode }).select('_id isActive');
    if (!loginCollege) return res.status(401).json({ error: 'Invalid college code or credentials' });
    if (!loginCollege.isActive) return res.status(403).json({ error: 'Institution is inactive' });
  }

  const lower = identifier.toLowerCase();
  const cnicNormalized = normalizeCnic(identifier);
  const conditions = [{ email: lower }];
  if (cnicNormalized.length === 13) conditions.push({ cnicNormalized });
  // Roll No login is student-only because only student accounts carry loginRollNo.
  conditions.push({ loginRollNo: lower });

  const userQuery = { $or: conditions };
  // The shared mobile app supplies collegeCode so authentication is tenant-scoped.
  // collegeCode stays optional here to preserve existing web/platform-owner login.
  if (loginCollege) userQuery.collegeId = loginCollege._id;

  const user = await User.findOne(userQuery).populate('roleIds');
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  let college = null;
  if (user.collegeId) {
    college = await College.findById(user.collegeId);
    if (!college || !college.isActive) return res.status(403).json({ error: 'Institution is inactive' });
  }

  const effective = new Set(user.directPermissions || []);
  for (const role of user.roleIds || []) if (role.isActive) for (const permission of role.permissions || []) effective.add(permission);
  user.effectivePermissions = [...effective];
  user.lastLoginAt = new Date();
  await user.save();

  return res.json({ token: sign(user), user: dto(user), college, portalAccess: await portalAccessFor(user) });
};

exports.changePassword = async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  if (newPassword === DEFAULT_PASSWORD) return res.status(400).json({ error: 'Choose a password different from the default password' });

  const user = await User.findById(req.user._id).select('+passwordHash').populate('roleIds');
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(400).json({ error: 'Current password is incorrect' });
  if (await bcrypt.compare(newPassword, user.passwordHash)) return res.status(400).json({ error: 'New password must be different from the current password' });

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  user.passwordChangedAt = new Date();
  await user.save();

  const effective = new Set(user.directPermissions || []);
  for (const role of user.roleIds || []) if (role.isActive) for (const permission of role.permissions || []) effective.add(permission);
  user.effectivePermissions = [...effective];

  return res.json({ message: 'Password changed successfully', user: dto(user), portalAccess: await portalAccessFor(user) });
};

exports.me = async (req, res) => {
  const college = req.user.collegeId ? await College.findById(req.user.collegeId) : null;
  return res.json({ user: dto(req.user), college, portalAccess: await portalAccessFor(req.user) });
};
