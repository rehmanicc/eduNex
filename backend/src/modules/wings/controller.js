const Wing = require('../../models/Wing');
const Branch = require('../../models/Branch');
const BranchWing = require('../../models/BranchWing');
const Program = require('../../models/Program');
const { audit } = require('../../services/auditService');

const TYPES = new Set(['school', 'college', 'cambridge', 'university']);

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '');
}

exports.structure = async (req, res) => {
  const [wings, branches, mappings] = await Promise.all([
    Wing.find(req.tenantFilter()).sort({ name: 1 }).lean(),
    Branch.find(req.branchFilter({ isActive: true })).sort({ name: 1 }).lean(),
    BranchWing.find(req.tenantFilter({ isActive: true }))
      .populate('wingId', 'name code academicType isActive')
      .lean()
  ]);

  const visibleBranchIds = new Set(branches.map(b => String(b._id)));

  res.json({
    academicTypes: [
      { value: 'school', label: 'School' },
      { value: 'college', label: 'College' },
      { value: 'cambridge', label: 'Cambridge' },
      { value: 'university', label: 'University' }
    ],
    wings,
    branches: branches.map(branch => ({
      ...branch,
      wingIds: mappings
        .filter(m =>
          String(m.branchId) === String(branch._id) &&
          visibleBranchIds.has(String(m.branchId)) &&
          m.wingId?.isActive !== false
        )
        .map(m => String(m.wingId?._id || m.wingId))
    }))
  });
};

exports.create = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const code = normalizeCode(req.body.code);
  const academicType = String(req.body.academicType || '').toLowerCase();

  if (!name || !code || !TYPES.has(academicType)) {
    return res.status(400).json({
      error: 'Wing name, code and Academic Type are required'
    });
  }

  try {
    const wing = await Wing.create({
      collegeId: req.collegeId,
      name,
      code,
      academicType,
      isActive: true,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    await audit(req, 'WING_CREATE', 'Wing', wing._id, {
      name,
      code,
      academicType
    });

    res.status(201).json(wing);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        error: 'Wing name or code already exists'
      });
    }
    throw error;
  }
};

exports.update = async (req, res) => {
  const wing = await Wing.findOne(
    req.tenantFilter({ _id: req.params.id })
  );

  if (!wing) {
    return res.status(404).json({ error: 'Wing not found' });
  }

  if (req.body.name !== undefined) {
    wing.name = String(req.body.name).trim();
  }

  if (req.body.code !== undefined) {
    wing.code = normalizeCode(req.body.code);
  }

  if (req.body.academicType !== undefined) {
    const nextType = String(req.body.academicType).toLowerCase();

    if (!TYPES.has(nextType)) {
      return res.status(400).json({ error: 'Invalid Academic Type' });
    }

    if (nextType !== wing.academicType) {
      const used = await Program.exists({
        collegeId: req.collegeId,
        wingId: wing._id
      });

      if (used) {
        return res.status(409).json({
          error:
            'Academic Type cannot be changed after Classes / Programs exist in this Wing'
        });
      }
    }

    wing.academicType = nextType;
  }

  if (req.body.isActive !== undefined) {
    if (req.body.isActive === false) {
      const used = await Program.exists({
        collegeId: req.collegeId,
        wingId: wing._id,
        isActive: true
      });

      if (used) {
        return res.status(409).json({
          error:
            'Deactivate/reassign active Classes / Programs before disabling this Wing'
        });
      }
    }
    wing.isActive = Boolean(req.body.isActive);
  }

  wing.updatedBy = req.user._id;
  await wing.save();

  await audit(req, 'WING_UPDATE', 'Wing', wing._id, {
    fields: Object.keys(req.body || {})
  });

  res.json(wing);
};

exports.setBranchWings = async (req, res) => {
  const branch = await Branch.findOne(
    req.branchFilter({ _id: req.params.branchId, isActive: true })
  );

  if (!branch) {
    return res.status(404).json({ error: 'Branch not found or not accessible' });
  }

  const wingIds = [
    ...new Set((req.body.wingIds || []).filter(Boolean).map(String))
  ];

  const wings = await Wing.find({
    collegeId: req.collegeId,
    _id: { $in: wingIds },
    isActive: true
  });

  if (wings.length !== wingIds.length) {
    return res.status(400).json({
      error: 'One or more selected Wings are invalid or inactive'
    });
  }

  await BranchWing.updateMany(
    { collegeId: req.collegeId, branchId: branch._id },
    { $set: { isActive: false } }
  );

  for (const wing of wings) {
    await BranchWing.findOneAndUpdate(
      {
        collegeId: req.collegeId,
        branchId: branch._id,
        wingId: wing._id
      },
      {
        $set: { isActive: true },
        $setOnInsert: {
          collegeId: req.collegeId,
          branchId: branch._id,
          wingId: wing._id
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  await audit(req, 'BRANCH_WINGS_UPDATE', 'Branch', branch._id, {
    wingIds
  });

  res.json({ branchId: branch._id, wingIds });
};
