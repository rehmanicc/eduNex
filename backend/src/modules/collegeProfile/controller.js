const path = require('path');
const College = require('../../models/College');
const Branch = require('../../models/Branch');
const { audit } = require('../../services/auditService');

const THEMES = {
  classic_blue: { primaryColor: '#1d4ed8', secondaryColor: '#0f172a', accentColor: '#38bdf8' },
  royal_indigo: { primaryColor: '#4338ca', secondaryColor: '#1e1b4b', accentColor: '#818cf8' },
  emerald: { primaryColor: '#047857', secondaryColor: '#132a21', accentColor: '#34d399' },
  teal: { primaryColor: '#0f766e', secondaryColor: '#134e4a', accentColor: '#2dd4bf' },
  forest: { primaryColor: '#166534', secondaryColor: '#14532d', accentColor: '#4ade80' },
  slate: { primaryColor: '#475569', secondaryColor: '#0f172a', accentColor: '#94a3b8' },
  maroon: { primaryColor: '#9f1239', secondaryColor: '#3f0d1f', accentColor: '#fb7185' },
  rose: { primaryColor: '#be123c', secondaryColor: '#4c0519', accentColor: '#fb7185' },
  amber: { primaryColor: '#b45309', secondaryColor: '#451a03', accentColor: '#fbbf24' },
  graphite: { primaryColor: '#334155', secondaryColor: '#111827', accentColor: '#64748b' }
};

function cleanText(value) {
  return value === undefined ? undefined : String(value || '').trim();
}

async function getCollege(req) {
  if (!req.collegeId) throw Object.assign(new Error('College context missing'), { status: 403 });
  const college = await College.findById(req.collegeId);
  if (!college) throw Object.assign(new Error('College not found'), { status: 404 });
  return college;
}

exports.get = async (req, res) => {
  const college = await getCollege(req);
  const branchCount = await Branch.countDocuments({ collegeId: college._id });
  res.json({ college, branchCount, themes: Object.keys(THEMES) });
};

exports.updateProfile = async (req, res) => {
  const college = await getCollege(req);
  const allowed = ['name', 'email', 'website', 'educationalSlogan', 'feeVoucherMode'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) college[key] = cleanText(req.body[key]);
  }

  if (req.body.themePreset !== undefined) {
    const preset = cleanText(req.body.themePreset);
    if (!THEMES[preset]) return res.status(400).json({ error: 'Invalid theme selection' });
    college.theme = { ...(college.theme?.toObject?.() || college.theme || {}), preset, ...THEMES[preset] };
  }


  await college.save();
  await audit(req, 'COLLEGE_PROFILE_UPDATE', 'College', college._id, {
    fields: [...allowed.filter(k => req.body[k] !== undefined), req.body.themePreset !== undefined ? 'theme' : null].filter(Boolean)
  });
  res.json(college);
};

exports.uploadLogo = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Logo file is required' });
  const college = await getCollege(req);
  college.logoUrl = `${req.protocol}://${req.get('host')}/uploads/colleges/${path.basename(req.file.path)}`;
  await college.save();
  await audit(req, 'COLLEGE_LOGO_UPDATE', 'College', college._id, { logoUrl: college.logoUrl });
  res.json({ logoUrl: college.logoUrl, college });
};

exports.uploadBanner = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Banner image is required' });
  const college = await getCollege(req);
  college.bannerUrl = `${req.protocol}://${req.get('host')}/uploads/colleges/${path.basename(req.file.path)}`;
  await college.save();
  await audit(req, 'COLLEGE_BANNER_UPDATE', 'College', college._id, { bannerUrl: college.bannerUrl });
  res.json({ bannerUrl: college.bannerUrl, college });
};

exports.listBranches = async (req, res) => {
  const college = await getCollege(req);
  const branches = await Branch.find(req.branchFilter({})).sort({ name: 1 }).lean();
  res.json({ branches, branchLimit: college.branchLimit || 1 });
};

exports.createBranch = async (req, res) => {
  const college = await getCollege(req);
  const limit = Number(college.branchLimit || 1);
  const count = await Branch.countDocuments({ collegeId: college._id });
  if (count >= limit) {
    return res.status(409).json({ error: `Branch limit reached. This institution is allowed a maximum of ${limit} active branch(es).` });
  }

  const name = cleanText(req.body.name);
  const code = cleanText(req.body.code)?.toUpperCase();
  if (!name || !code) return res.status(400).json({ error: 'Branch name and code are required' });

  try {
    const branch = await Branch.create({
      collegeId: college._id,
      name,
      code,
      address: cleanText(req.body.address),
      contactNo: cleanText(req.body.contactNo),
      isActive: req.body.isActive !== false
    });
    await audit(req, 'BRANCH_CREATE', 'Branch', branch._id, { name, code });
    res.status(201).json(branch);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Branch name or code already exists' });
    throw e;
  }
};

exports.updateBranch = async (req, res) => {
  const branch = await Branch.findOne(req.tenantFilter({ _id: req.params.id }));
  if (!branch) return res.status(404).json({ error: 'Branch not found' });
  req.assertBranch(branch._id);



  for (const key of ['name', 'address', 'contactNo']) if (req.body[key] !== undefined) branch[key] = cleanText(req.body[key]);
  if (req.body.code !== undefined) branch.code = cleanText(req.body.code).toUpperCase();
  if (req.body.isActive !== undefined) branch.isActive = Boolean(req.body.isActive);

  try {
    await branch.save();
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Branch name or code already exists' });
    throw e;
  }

  await audit(req, 'BRANCH_UPDATE', 'Branch', branch._id, { fields: Object.keys(req.body || {}) });
  res.json(branch);
};

exports.updateTimetable = async (req, res) => {
  const college = await getCollege(req);
  const input = req.body || {};
  const validDays = new Set(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
  const workingDays = Array.isArray(input.workingDays) ? input.workingDays.filter(d => validDays.has(d)) : [];
  if (!workingDays.length) return res.status(400).json({ error: 'Select at least one working day' });

  const rawSlots = Array.isArray(input.scheduleSlots) ? input.scheduleSlots : [];
  let teachingNo = 0;
  const slots = rawSlots.map((slot, index) => {
    const isBreak = Boolean(slot.isBreak) || String(slot.label || '').trim().toLowerCase().includes('break');
    if (!isBreak) teachingNo += 1;
    return {
      isBreak,
      label: cleanText(slot.label) || (isBreak ? 'Break' : `Period ${teachingNo}`),
      periodNo: isBreak ? undefined : teachingNo,
      startTime: cleanText(slot.startTime),
      endTime: cleanText(slot.endTime)
    };
  });
  if (!slots.length) return res.status(400).json({ error: 'Add at least one period definition' });
  for (const slot of slots) {
    if (!slot.startTime || !slot.endTime || slot.endTime <= slot.startTime) {
      return res.status(400).json({ error: `Check start/end time for ${slot.label}` });
    }
  }

  college.timetableSettings = {
    workingDays,
    periodsPerDay: teachingNo,
    dayStartTime: slots[0]?.startTime || '08:00',
    dayEndTime: slots[slots.length - 1]?.endTime || '14:00',
    scheduleSlots: slots
  };
  await college.save();
  await audit(req, 'TIMETABLE_SETTINGS_UPDATE', 'College', college._id, { workingDays, periodsPerDay: teachingNo, slots: slots.length });
  res.json(college.timetableSettings);
};
