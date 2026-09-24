const bcrypt = require('bcryptjs');
const { getPagination, setPaginationHeaders } = require('../../utils/pagination');
const Employee = require('../../models/Employee');
const EmployeeSequence = require('../../models/EmployeeSequence');
const Course = require('../../models/Course');
const Designation = require('../../models/Designation');
const Branch = require('../../models/Branch');
const BranchWing = require('../../models/BranchWing');
const Role = require('../../models/Role');
const User = require('../../models/User');
const TeacherAssignment = require('../../models/TeacherAssignment');
const EmployeeContract = require('../../models/EmployeeContract');
const EmployeeLeave = require('../../models/EmployeeLeave');
const EmployeeLoan = require('../../models/EmployeeLoan');
const PayrollRecord = require('../../models/PayrollRecord');
const SalaryStructure = require('../../models/SalaryStructure');
const { WINGS } = require('../../constants/wings');
const mongoose = require('mongoose');
const { seedDefaultDesignations } = require('../../services/designationService');
const { seedDefaultRoles } = require('../../services/roleService');
const { audit } = require('../../services/auditService');
const { syncEmployeeAccess } = require('../../services/accountProvisioningService');

const DEFAULT_PASSWORD = 'user@123';
const normalizeCnic = value => String(value || '').replace(/\D/g, '');
const syntheticEmail = cnic => `${cnic}@cnic.local`;


const VALID_CATEGORIES = new Set([
  'academic_staff',
  'non_teaching_staff'
]);

function formatEmployeeNo(number) {
  return `EMP-${String(number).padStart(2, '0')}`;
}

async function getStartingNumber(collegeId) {
  const employees = await Employee.find({ collegeId })
    .select('employeeNo employeeCode')
    .lean();

  let max = 0;

  for (const employee of employees) {
    const value = employee.employeeNo || employee.employeeCode || '';
    const match =
      /^EMP-(\d+)$/.exec(value) ||
      /^E(\d+)$/.exec(value);

    if (match) max = Math.max(max, Number(match[1]));
  }

  return max;
}

async function nextEmployeeNo(collegeId) {
  let sequence = await EmployeeSequence.findOne({ collegeId });

  if (!sequence) {
    const startingNumber = await getStartingNumber(collegeId);

    try {
      sequence = await EmployeeSequence.create({
        collegeId,
        lastNumber: startingNumber
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  const updated = await EmployeeSequence.findOneAndUpdate(
    { collegeId },
    { $inc: { lastNumber: 1 } },
    { new: true, upsert: true }
  );

  return formatEmployeeNo(updated.lastNumber);
}

function normalizePayload(body) {
  const category = body.category;
  const academic = category === 'academic_staff';

  const mobileNo = String(
    body.mobileNo ?? body.phone ?? ''
  ).trim();

  const dateOfJoining =
    body.dateOfJoining ||
    body.joiningDate ||
    body.doj ||
    undefined;

  const dateOfBirth =
    body.dateOfBirth ||
    body.dob ||
    undefined;

  return {
    name: body.name ? String(body.name).trim() : '',
    fatherName: body.fatherName ? String(body.fatherName).trim() : '',
    cnic: body.cnic ? String(body.cnic).trim() : '',
    qualification: body.qualification || '',
    mobileNo,
    phone: mobileNo,
    address: body.address ? String(body.address).trim() : '',
    dateOfBirth,
    dob: dateOfBirth,
    dateOfJoining,
    joiningDate: dateOfJoining,

    category,
    subjectId: academic
      ? (body.subjectId || body.primarySubjectId || null)
      : null,

    designationId: body.designationId || null,
    branchId: body.branchId || body.primaryBranchId || null,
    wingType: body.wingType || undefined,

    email: body.email ? String(body.email).trim().toLowerCase() : '',
    basicSalary:
      body.basicSalary === '' || body.basicSalary === undefined
        ? undefined
        : Number(body.basicSalary),

    isActive:
      body.isActive === undefined
        ? undefined
        : Boolean(body.isActive)
  };
}

async function validateEmployeePosting(req, payload, collegeId) {
  const requiredText = [
    ['name', 'Name'],
    ['fatherName', 'Father Name'],
    ['cnic', 'CNIC'],
    ['qualification', 'Qualification'],
    ['mobileNo', 'Mobile No'],
    ['address', 'Address']
  ];

  for (const [field, label] of requiredText) {
    if (!String(payload[field] || '').trim()) {
      throw Object.assign(new Error(`${label} is required`), { status: 400 });
    }
  }

  if (!payload.dateOfBirth) {
    throw Object.assign(new Error('Date of Birth is required'), { status: 400 });
  }

  if (!payload.dateOfJoining) {
    throw Object.assign(new Error('Date of Joining is required'), { status: 400 });
  }

  if (payload.category === 'academic_staff' && !payload.subjectId) {
    throw Object.assign(
      new Error('Primary Subject is required for Academic employees'),
      { status: 400 }
    );
  }

  if (payload.category !== 'academic_staff') {
    payload.subjectId = null;
  }

  if (!VALID_CATEGORIES.has(payload.category)) {
    throw Object.assign(
      new Error('Employee category must be Academic Staff or Non-Teaching Staff'),
      { status: 400 }
    );
  }

  if (!payload.designationId) {
    throw Object.assign(new Error('Designation is required'), { status: 400 });
  }

  const designation = await Designation.findOne({
    _id: payload.designationId,
    collegeId,
    isActive: true
  });

  if (!designation) {
    throw Object.assign(new Error('Invalid or inactive designation'), { status: 400 });
  }

  if (designation.category !== payload.category) {
    throw Object.assign(
      new Error('Selected designation does not belong to the selected employee category'),
      { status: 400 }
    );
  }

  if (!payload.branchId) {
    throw Object.assign(new Error('Branch is required'), { status: 400 });
  }

  req.assertBranch(payload.branchId);

  const branch = await Branch.findOne({
    _id: payload.branchId,
    collegeId,
    isActive: true
  });

  if (!branch) {
    throw Object.assign(new Error('Invalid or inactive branch'), { status: 400 });
  }

  if (payload.wingType) {
    const branchWing = await BranchWing.exists({
      collegeId,
      branchId: payload.branchId,
      wingType: payload.wingType,
      isActive: true
    });

    if (!branchWing) {
      throw Object.assign(
        new Error('Selected Wing is not enabled for this branch'),
        { status: 400 }
      );
    }
  }

  if (payload.category === 'academic_staff' && payload.subjectId) {
    if (!mongoose.isValidObjectId(payload.subjectId)) {
      throw Object.assign(new Error('Invalid Primary Subject'), { status: 400 });
    }

    const subject = await Course.findOne({
      _id: payload.subjectId,
      collegeId
    });

    if (!subject) {
      throw Object.assign(
        new Error('Selected Primary Subject does not belong to this institution'),
        { status: 400 }
      );
    }
  }

  return designation;
}

async function allowedLoginRoles(req, collegeId) {
  const roleCodes = new Set(req.user.roleCodes || []);
  const isDirector = roleCodes.has('director');
  const isPrincipal = roleCodes.has('principal');

  if (!isDirector && !isPrincipal) return [];

  const filter = {
    collegeId,
    isActive: true,
    code: { $ne: 'director' }
  };

  // Principals cannot grant the Principal role to another account.
  if (isPrincipal && !isDirector) {
    filter.code = { $nin: ['director', 'principal'] };
  }

  return Role.find(filter).sort({ name: 1 });
}

async function validateRoleIds(req, collegeId, roleIds) {
  const ids = Array.isArray(roleIds) ? roleIds.filter(Boolean) : [];
  if (!ids.length) return [];

  const allowed = await allowedLoginRoles(req, collegeId);
  const allowedMap = new Map(allowed.map(role => [String(role._id), role]));

  const roles = ids.map(id => allowedMap.get(String(id))).filter(Boolean);

  if (roles.length !== ids.length) {
    throw Object.assign(
      new Error('One or more selected login roles cannot be assigned by your account'),
      { status: 403 }
    );
  }

  return roles;
}

async function validateLoginBranchAccess(req, collegeId, input, roles, primaryBranchId) {
  const hasPrincipalRole = roles.some(role => role.code === 'principal');
  const requestedMode = input?.mode === 'all' ? 'all' : 'selected';
  let requestedIds = Array.isArray(input?.branchIds)
    ? [...new Set(input.branchIds.filter(Boolean).map(String))]
    : [];

  if (!requestedIds.length && primaryBranchId) {
    requestedIds = [String(primaryBranchId)];
  }

  // Director may grant Principal all-branch or selected-branch access.
  if (hasPrincipalRole && requestedMode === 'all') {
    const isDirector = (req.user.roleCodes || []).includes('director');
    if (!isDirector) {
      throw Object.assign(
        new Error('Only the Director can grant all-branch Principal access'),
        { status: 403 }
      );
    }
    return { mode: 'all', branchIds: [] };
  }

  for (const branchId of requestedIds) {
    req.assertBranch(branchId);

    const exists = await Branch.exists({
      _id: branchId,
      collegeId,
      isActive: true
    });

    if (!exists) {
      throw Object.assign(new Error('Invalid branch access selection'), { status: 400 });
    }
  }

  return {
    mode: 'selected',
    branchIds: requestedIds
  };
}

exports.options = async (req, res) => {
  const collegeId = req.collegeId;
  await Promise.all([seedDefaultDesignations(collegeId), seedDefaultRoles(collegeId)]);

  const [designations, branches, branchWings, roles, subjects] = await Promise.all([
    Designation.find(req.tenantFilter()).sort({ category: 1, name: 1 }),
    Branch.find(req.branchFilter({ isActive: true })).sort({ name: 1 }),
    BranchWing.find(req.branchFilter({ isActive: true })).lean(),
    allowedLoginRoles(req, collegeId),
    Course.find({ collegeId }).sort({ name: 1 }).lean()
  ]);

  const availableWings = Array.isArray(WINGS)
    ? WINGS
    : Object.entries(WINGS || {}).map(([value, item]) => ({
        value,
        label:
          typeof item === 'string'
            ? item
            : item?.label || item?.name || value
      }));

  res.json({
    categories: [
      { value: 'academic_staff', label: 'Academic' },
      { value: 'non_teaching_staff', label: 'Non-Academic' }
    ],
    qualifications: [
      { value: 'matric', label: 'Matric' },
      { value: 'intermediate', label: 'Intermediate' },
      { value: 'bachelor', label: 'Bachelor' },
      { value: 'graduate', label: 'Graduate' },
      { value: 'master', label: 'Master' },
      { value: 'mphil', label: 'MPhil' },
      { value: 'phd', label: 'PhD' }
    ],
    designations,
    subjects,
    branches: branches.map(branch => ({
      ...branch.toObject(),
      wingTypes: branchWings
        .filter(row => String(row.branchId) === String(branch._id))
        .map(row => row.wingType)
        .filter(Boolean)
    })),
    availableWings,
    roles,
    canManageLoginAccess: roles.length > 0
  });
};

exports.list = async (req, res) => {
  const filter = req.branchFilter();
  const paging = getPagination(req.query, { defaultLimit: 200, maxLimit: 500 });
  let employeeQuery = Employee.find(filter)
    .populate('designationId', 'name category isActive')
    .populate('branchId', 'name code')
    .populate('subjectId', 'name title code')
    .sort({ createdAt: -1 });

  let total = null;
  let docs;
  if (paging.requested) {
    [docs, total] = await Promise.all([
      employeeQuery.skip(paging.skip).limit(paging.limit),
      Employee.countDocuments(filter)
    ]);
    setPaginationHeaders(res, { ...paging, total });
  } else {
    docs = await employeeQuery.limit(200);
  }

  const employeeIds = docs.map(doc => doc._id);

  const linkedUsers = await User.find({
    collegeId: req.collegeId,
    linkedEmployeeId: { $in: employeeIds }
  })
    .select('-passwordHash')
    .populate('roleIds', 'name code');

  const userByEmployee = new Map(
    linkedUsers.map(user => [String(user.linkedEmployeeId), user])
  );

  res.json(
    docs.map(doc => ({
      ...doc.toObject(),
      linkedUser: userByEmployee.get(String(doc._id)) || null
    }))
  );
};

exports.get = async (req, res) => {
  const doc = await Employee.findOne(
    req.branchFilter({ _id: req.params.id })
  )
    .populate('designationId', 'name category isActive')
    .populate('branchId', 'name code')
    .populate('subjectId', 'name title code');

  if (!doc) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const linkedUser = await User.findOne({
    collegeId: req.collegeId,
    linkedEmployeeId: doc._id
  })
    .select('-passwordHash')
    .populate('roleIds', 'name code');

  res.json({
    ...doc.toObject(),
    linkedUser
  });
};

exports.create = async (req, res) => {
  const collegeId = req.collegeId || req.user.collegeId;
  await seedDefaultDesignations(collegeId);

  const payload = normalizePayload(req.body);
  const designation = await validateEmployeePosting(
    req,
    payload,
    collegeId
  );

  // Every employee receives a linked login by default. Academic employees
  // always receive Employee + Teacher baseline roles. Extra roles may be added later.
  const createLogin = req.body.createLogin !== false;
  let roles = [];

  if (createLogin) {
    const defaults = await seedDefaultRoles(collegeId);
    const required = [defaults.employee];
    if (payload.category === 'academic_staff') required.push(defaults.teacher);

    const extras = Array.isArray(req.body.roleIds) && req.body.roleIds.length
      ? await validateRoleIds(req, collegeId, req.body.roleIds)
      : [];

    const roleMap = new Map();
    [...required, ...extras].filter(Boolean).forEach(role => roleMap.set(String(role._id), role));
    roles = [...roleMap.values()];
  }

  let employee;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const employeeNo = await nextEmployeeNo(collegeId);

    try {
      employee = await Employee.create({
        ...payload,
        collegeId,
        employeeNo,
        employeeCode: employeeNo,
        // Keep legacy designation readable for old reports during transition.
        designation: designation.name
      });
      break;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  if (!employee) {
    return res.status(409).json({
      error: 'Unable to allocate a unique employee number. Please try again.'
    });
  }

  let linkedUser = null;

  try {
    if (createLogin) {
      const cnicNormalized = normalizeCnic(employee.cnic);
      if (cnicNormalized.length !== 13) {
        throw Object.assign(new Error('Employee CNIC must contain 13 digits to create login'), { status: 400 });
      }

      const requestedEmail = String(req.body.loginEmail || employee.email || '').trim().toLowerCase();
      const loginEmail = requestedEmail || syntheticEmail(cnicNormalized);

      const duplicate = await User.exists({
        $or: [{ email: loginEmail }, { cnicNormalized }]
      });

      if (duplicate) {
        throw Object.assign(
          new Error('A login account with this email or CNIC already exists'),
          { status: 409 }
        );
      }

      const branchAccess = await validateLoginBranchAccess(
        req,
        collegeId,
        req.body.branchAccess,
        roles,
        employee.branchId
      );

      linkedUser = await User.create({
        collegeId,
        name: employee.name,
        email: loginEmail,
        emailIsSynthetic: !requestedEmail,
        cnic: employee.cnic,
        cnicNormalized,
        phone: employee.phone,
        passwordHash: await bcrypt.hash(DEFAULT_PASSWORD, 12),
        mustChangePassword: true,
        roleIds: roles.map(role => role._id),
        directPermissions: [],
        linkedEmployeeId: employee._id,
        branchAccess,
        isActive: true
      });
    }
  } catch (error) {
    // Keep employee + user creation atomic from the user's perspective.
    await Employee.deleteOne({ _id: employee._id, collegeId });
    throw error;
  }

  await audit(req, 'CREATE', 'Employee', employee._id, {
    employeeNo: employee.employeeNo,
    designation: designation.name,
    category: employee.category,
    branchId: employee.branchId,
    loginCreated: Boolean(linkedUser),
    roles: roles.map(role => role.code)
  });

  const populated = await Employee.findById(employee._id)
    .populate('designationId', 'name category isActive')
    .populate('branchId', 'name code')
    .populate('subjectId', 'name title code');

  res.status(201).json({
    ...populated.toObject(),
    linkedUser: linkedUser
      ? await User.findById(linkedUser._id)
          .select('-passwordHash')
          .populate('roleIds', 'name code')
      : null
  });
};

exports.update = async (req, res) => {
  const existing = await Employee.findOne(
    req.branchFilter({ _id: req.params.id })
  );

  if (!existing) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const collegeId = existing.collegeId;
  const payload = normalizePayload({
    ...existing.toObject(),
    ...req.body
  });

  const designation = await validateEmployeePosting(
    req,
    payload,
    collegeId
  );

  const doc = await Employee.findOneAndUpdate(
    req.branchFilter({ _id: req.params.id }),
    {
      ...payload,
      designation: designation.name
    },
    {
      new: true,
      runValidators: true
    }
  )
    .populate('designationId', 'name category isActive')
    .populate('branchId', 'name code')
    .populate('subjectId', 'name title code');

  const linkedUser = await User.findOne({
    collegeId,
    linkedEmployeeId: doc._id
  });

  if (linkedUser) {
    linkedUser.name = doc.name;
    linkedUser.phone = doc.phone;
    linkedUser.cnic = doc.cnic;
    linkedUser.cnicNormalized = normalizeCnic(doc.cnic);
    if (doc.email) {
      linkedUser.email = String(doc.email).trim().toLowerCase();
      linkedUser.emailIsSynthetic = false;
    } else if (linkedUser.emailIsSynthetic) {
      linkedUser.email = syntheticEmail(linkedUser.cnicNormalized);
    }

    const defaults = await seedDefaultRoles(collegeId);
    const currentRoleIds = (linkedUser.roleIds || []).map(String);
    const teacherId = defaults.teacher ? String(defaults.teacher._id) : '';
    const employeeId = defaults.employee ? String(defaults.employee._id) : '';
    const baseline = new Set(currentRoleIds.filter(id => id !== teacherId));
    if (employeeId) baseline.add(employeeId);
    if (doc.category === 'academic_staff' && teacherId) baseline.add(teacherId);
    linkedUser.roleIds = [...baseline];

    // Extra login roles are edited explicitly from User Accounts/System Access.
    if (Array.isArray(req.body.roleIds)) {
      let roles = await validateRoleIds(req, collegeId, req.body.roleIds);
      if (!roles.length) {
        return res.status(400).json({
          error: 'A linked login account must have at least one role'
        });
      }
      const required = [defaults.employee];
      if (doc.category === 'academic_staff') required.push(defaults.teacher);
      const roleMap = new Map();
      [...required, ...roles].filter(Boolean).forEach(role => roleMap.set(String(role._id), role));
      roles = [...roleMap.values()];
      linkedUser.roleIds = roles.map(role => role._id);

      linkedUser.branchAccess = await validateLoginBranchAccess(
        req,
        collegeId,
        req.body.branchAccess || linkedUser.branchAccess,
        roles,
        doc.branchId
      );
    }

    // Employment lifecycle controls account lifecycle. Leaving/inactive staff keep history but lose login.
    linkedUser.isActive = doc.isActive !== false;
    await linkedUser.save();
  }

  await audit(req, 'UPDATE', 'Employee', doc._id, {
    fields: Object.keys(req.body || {}),
    designation: designation.name
  });

  res.json({
    ...doc.toObject(),
    linkedUser: linkedUser
      ? await User.findById(linkedUser._id)
          .select('-passwordHash')
          .populate('roleIds', 'name code')
      : null
  });
};

exports.createLogin = async (req, res) => {
  const employee = await Employee.findOne(
    req.branchFilter({ _id: req.params.id })
  );

  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const existing = await User.exists({ collegeId: req.collegeId, linkedEmployeeId: employee._id });
  if (existing) return res.status(409).json({ error: 'This employee already has a login account' });

  const defaults = await seedDefaultRoles(req.collegeId);
  const required = [defaults.employee];
  if (employee.category === 'academic_staff') required.push(defaults.teacher);

  const extras = Array.isArray(req.body.roleIds) && req.body.roleIds.length
    ? await validateRoleIds(req, req.collegeId, req.body.roleIds)
    : [];
  const roleMap = new Map();
  [...required, ...extras].filter(Boolean).forEach(role => roleMap.set(String(role._id), role));
  const roles = [...roleMap.values()];

  const cnicNormalized = normalizeCnic(employee.cnic);
  if (cnicNormalized.length !== 13) return res.status(400).json({ error: 'Employee CNIC must contain 13 digits to create login' });

  const requestedEmail = String(req.body.email || employee.email || '').trim().toLowerCase();
  const email = requestedEmail || syntheticEmail(cnicNormalized);
  if (await User.exists({ $or: [{ email }, { cnicNormalized }] })) {
    return res.status(409).json({ error: 'A login account with this email or CNIC already exists' });
  }

  const branchAccess = await validateLoginBranchAccess(
    req, req.collegeId, req.body.branchAccess, roles, employee.branchId
  );

  const user = await User.create({
    collegeId: req.collegeId,
    name: employee.name,
    email,
    emailIsSynthetic: !requestedEmail,
    cnic: employee.cnic,
    cnicNormalized,
    phone: employee.phone,
    passwordHash: await bcrypt.hash(DEFAULT_PASSWORD, 12),
    mustChangePassword: true,
    roleIds: roles.map(role => role._id),
    linkedEmployeeId: employee._id,
    branchAccess,
    isActive: true
  });

  await audit(req, 'EMPLOYEE_LOGIN_CREATE', 'User', user._id, {
    employeeId: employee._id,
    roles: roles.map(role => role.code),
    defaultPasswordIssued: true
  });

  res.status(201).json(await User.findById(user._id).select('-passwordHash').populate('roleIds', 'name code'));
};


exports.uploadPhoto = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid employee id' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Employee photo is required' });
  }

  const employee = await Employee.findOne(
    req.branchFilter({ _id: req.params.id })
  );

  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  employee.photoUrl = `/uploads/employees/${req.file.filename}`;
  await employee.save();

  await audit(req, 'EMPLOYEE_PHOTO_UPDATE', 'Employee', employee._id, {
    photoUrl: employee.photoUrl
  });

  res.json({
    employeeId: employee._id,
    photoUrl: employee.photoUrl
  });
};

exports.remove = async (req, res) => {
  const employee = await Employee.findOne(
    req.branchFilter({ _id: req.params.id })
  );

  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const collegeId = employee.collegeId;
  const employeeId = employee._id;

  const [
    assignments,
    contracts,
    leaves,
    loans,
    payrollRecords,
    salaryStructures,
    userAccounts
  ] = await Promise.all([
    TeacherAssignment.countDocuments({ collegeId, teacherId: employeeId }),
    EmployeeContract.countDocuments({ collegeId, employeeId }),
    EmployeeLeave.countDocuments({ collegeId, employeeId }),
    EmployeeLoan.countDocuments({ collegeId, employeeId }),
    PayrollRecord.countDocuments({ collegeId, employeeId }),
    SalaryStructure.countDocuments({ collegeId, employeeId }),
    User.countDocuments({ collegeId, linkedEmployeeId: employeeId })
  ]);

  const dependencies = [];

  if (assignments) dependencies.push(`${assignments} teacher assignment(s)`);
  if (contracts) dependencies.push(`${contracts} contract(s)`);
  if (leaves) dependencies.push(`${leaves} leave record(s)`);
  if (loans) dependencies.push(`${loans} loan/advance record(s)`);
  if (payrollRecords) dependencies.push(`${payrollRecords} payroll record(s)`);
  if (salaryStructures) dependencies.push(`${salaryStructures} salary structure(s)`);
  if (userAccounts) dependencies.push(`${userAccounts} linked user account(s)`);

  if (dependencies.length) {
    return res.status(409).json({
      error:
        `Employee cannot be deleted because the record is already in use: ${dependencies.join(', ')}.`
    });
  }

  await employee.deleteOne();

  await audit(req, 'DELETE', 'Employee', employee._id, {
    employeeNo: employee.employeeNo
  });

  res.json({ message: 'Employee deleted successfully' });
};
