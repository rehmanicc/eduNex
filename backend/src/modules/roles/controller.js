const Role = require('../../models/Role');
const User = require('../../models/User');
const Employee = require('../../models/Employee');
const P = require('../../constants/permissions');
const { audit } = require('../../services/auditService');
const { seedDefaultRoles } = require('../../services/roleService');

const VALID_PERMISSIONS = new Set(Object.values(P));

const PERMISSION_GROUPS = [
  ['Users & Roles', ['MANAGE_COLLEGE','MANAGE_USERS','MANAGE_USER_ROLES','MANAGE_ROLES']],
  ['Admissions', ['VIEW_ADMISSIONS','MANAGE_ADMISSIONS','APPROVE_ADMISSIONS','MANAGE_STUDENT_LIFECYCLE']],
  ['Students & Employees', ['VIEW_STUDENTS','MANAGE_STUDENTS','VIEW_EMPLOYEES','MANAGE_EMPLOYEES']],
  ['Academics & Attendance', ['VIEW_ACADEMICS','MANAGE_ACADEMICS','VIEW_ATTENDANCE','MARK_ATTENDANCE','CORRECT_ATTENDANCE','MANAGE_BIOMETRIC']],
  ['Fees & Finance', ['VIEW_FEES','MANAGE_FEES','RECEIVE_FEE_PAYMENTS','VOID_FEE_PAYMENTS','POST_FEE_PAYMENTS','LOCK_FEE_PACKAGE','VIEW_FEE_AUDIT','VIEW_FINANCE','MANAGE_FINANCE','CREATE_FINANCE_TRANSACTION','APPROVE_FINANCE_TRANSACTION','POST_FINANCE_TRANSACTION','REVERSE_FINANCE_TRANSACTION','MANAGE_FINANCE_ACCOUNTS','MANAGE_FINANCE_HEADS','VIEW_FINANCE_REPORTS','MANAGE_EXPENSES']],
  ['Exams & Results', ['VIEW_EXAMS','MANAGE_EXAMS','ENTER_EXAM_MARKS','VERIFY_EXAM_MARKS','PUBLISH_RESULTS','MANAGE_GRADING','VIEW_RESULT_REPORTS']],
  ['Library', ['VIEW_LIBRARY','MANAGE_LIBRARY','ISSUE_LIBRARY_BOOKS','RETURN_LIBRARY_BOOKS','MANAGE_LIBRARY_FINES','MANAGE_LIBRARY_SETTINGS','VIEW_LIBRARY_REPORTS']],
  ['Transport', ['VIEW_TRANSPORT','MANAGE_TRANSPORT','MANAGE_TRANSPORT_VEHICLES','MANAGE_TRANSPORT_ROUTES','MANAGE_TRANSPORT_ASSIGNMENTS','MANAGE_TRANSPORT_MAINTENANCE','VIEW_TRANSPORT_REPORTS']],
  ['Hostel', ['VIEW_HOSTEL','MANAGE_HOSTEL','MANAGE_HOSTELS','MANAGE_HOSTEL_ROOMS','MANAGE_HOSTEL_ALLOCATIONS','MANAGE_HOSTEL_MESS','MANAGE_HOSTEL_COMPLAINTS','VIEW_HOSTEL_REPORTS']],
  ['Payroll', ['VIEW_PAYROLL','MANAGE_PAYROLL','MANAGE_EMPLOYEE_CONTRACTS','MANAGE_SALARY_STRUCTURES','MANAGE_EMPLOYEE_LEAVE','APPROVE_EMPLOYEE_LEAVE','MANAGE_EMPLOYEE_LOANS','GENERATE_PAYROLL','APPROVE_PAYROLL','MARK_PAYROLL_PAID','VIEW_PAYROLL_REPORTS']],
  ['Notices', ['VIEW_NOTICES','MANAGE_NOTICES','SEND_NOTICES','VIEW_COMMUNICATION_REPORTS']],
  ['Events', ['VIEW_EVENTS','MANAGE_EVENTS','MANAGE_EVENT_REGISTRATIONS','VIEW_EVENT_REPORTS']],
  ['Reports', ['VIEW_REPORTS']]
].map(([name, keys]) => ({
  name,
  permissions: keys.filter(key => VALID_PERMISSIONS.has(key)).map(key => ({ code: key, label: key.split('_').map(x => x[0] + x.slice(1).toLowerCase()).join(' ') }))
}));

function cleanPermissions(input) {
  return [...new Set((Array.isArray(input) ? input : []).filter(p => VALID_PERMISSIONS.has(p)))];
}

exports.list = async (req, res) => {
  if (req.collegeId) await seedDefaultRoles(req.collegeId);
  res.json(await Role.find(req.tenantFilter({ isActive: true })).sort({ isProtected: -1, name: 1 }));
};

exports.permissionCatalog = async (_req, res) => res.json({ groups: PERMISSION_GROUPS });

exports.create = async (req, res) => {
  if (!req.collegeId) return res.status(400).json({ error: 'collegeId required' });
  const name = String(req.body.name || '').trim();
  const code = String(req.body.code || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!name || !code) return res.status(400).json({ error: 'Role name and code are required' });
  if (await Role.exists({ collegeId: req.collegeId, code })) return res.status(409).json({ error: 'A role with this code already exists' });

  const role = await Role.create({
    collegeId: req.collegeId,
    name,
    code,
    description: String(req.body.description || '').trim(),
    permissions: cleanPermissions(req.body.permissions),
    isProtected: false,
    isActive: true
  });
  await audit(req, 'ROLE_CREATE', 'Role', role._id, { code: role.code });
  res.status(201).json(role);
};

exports.update = async (req, res) => {
  const role = await Role.findOne(req.tenantFilter({ _id: req.params.id }));
  if (!role) return res.status(404).json({ error: 'Role not found' });

  if (!role.isProtected) {
    if (req.body.name !== undefined) role.name = String(req.body.name || '').trim() || role.name;
    if (req.body.code !== undefined) {
      const nextCode = String(req.body.code || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      if (!nextCode) return res.status(400).json({ error: 'Role code is required' });
      const conflict = await Role.exists({ collegeId: role.collegeId, code: nextCode, _id: { $ne: role._id } });
      if (conflict) return res.status(409).json({ error: 'A role with this code already exists' });
      role.code = nextCode;
    }
    if (req.body.description !== undefined) role.description = String(req.body.description || '').trim();
  }

  if (role.code === 'director') role.permissions = ['*'];
  else if (req.body.permissions !== undefined) role.permissions = cleanPermissions(req.body.permissions);
  if (!role.isProtected && req.body.isActive !== undefined) role.isActive = Boolean(req.body.isActive);

  await role.save();
  await audit(req, 'ROLE_UPDATE', 'Role', role._id, { code: role.code, permissions: role.permissions });
  res.json(role);
};

exports.assign = async (req, res) => {
  if (String(req.user._id) === String(req.params.userId)) return res.status(400).json({ error: 'You cannot change your own roles' });
  const user = await User.findOne(req.tenantFilter({ _id: req.params.userId }));
  if (!user) return res.status(404).json({ error: 'User not found' });

  await seedDefaultRoles(user.collegeId);
  let roles = await Role.find({ _id: { $in: req.body.roleIds || [] }, collegeId: user.collegeId, isActive: true });
  if (roles.length !== (req.body.roleIds || []).length) return res.status(400).json({ error: 'One or more roles are invalid for this college' });

  if (user.linkedEmployeeId) {
    const employee = await Employee.findOne({ _id: user.linkedEmployeeId, collegeId: user.collegeId }).lean();
    if (employee) {
      const requiredCodes = ['employee'];
      if (employee.category === 'academic_staff') requiredCodes.push('teacher');
      const requiredRoles = await Role.find({ collegeId: user.collegeId, code: { $in: requiredCodes }, isActive: true });
      const map = new Map(roles.map(role => [String(role._id), role]));
      requiredRoles.forEach(role => map.set(String(role._id), role));
      roles = [...map.values()];
    }
  }

  const [currentDirector, currentPrincipal] = await Promise.all([
    Role.findOne({ collegeId: user.collegeId, code: 'director' }),
    Role.findOne({ collegeId: user.collegeId, code: 'principal' })
  ]);

  const removingDirector = currentDirector && (user.roleIds || []).some(x => String(x) === String(currentDirector._id)) && !roles.some(x => x.code === 'director');
  if (removingDirector) {
    const other = await User.exists({ collegeId: user.collegeId, _id: { $ne: user._id }, roleIds: currentDirector._id, isActive: true });
    if (!other && !req.isPlatformOwner) return res.status(400).json({ error: 'Assign another Director before removing the final Director' });
  }

  const hadPrincipal = currentPrincipal && (user.roleIds || []).some(x => String(x) === String(currentPrincipal._id));
  const willBePrincipal = roles.some(x => x.code === 'principal');
  user.roleIds = roles.map(r => r._id);

  if (!hadPrincipal && willBePrincipal) user.branchAccess = { mode: 'selected', branchIds: [] };

  await user.save();
  await audit(req, 'USER_ROLES_UPDATE', 'User', user._id, { roles: roles.map(r => r.code) });
  res.json(await User.findById(user._id).select('-passwordHash').populate('roleIds').populate('branchAccess.branchIds', 'name code isActive'));
};
