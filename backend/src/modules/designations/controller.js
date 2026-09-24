const Designation = require('../../models/Designation');
const Employee = require('../../models/Employee');
const { seedDefaultDesignations } = require('../../services/designationService');
const { audit } = require('../../services/auditService');

const VALID_CATEGORIES = new Set([
  'academic_staff',
  'non_teaching_staff'
]);

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

exports.list = async (req, res) => {
  await seedDefaultDesignations(req.collegeId);

  const filter = req.tenantFilter();

  if (req.query.category) {
    if (!VALID_CATEGORIES.has(req.query.category)) {
      return res.status(400).json({ error: 'Invalid designation category' });
    }
    filter.category = req.query.category;
  }

  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;

  const docs = await Designation.find(filter)
    .sort({ category: 1, name: 1 });

  res.json(docs);
};

exports.create = async (req, res) => {
  const name = cleanName(req.body.name);
  const category = req.body.category;

  if (!name) {
    return res.status(400).json({ error: 'Designation name is required' });
  }

  if (!VALID_CATEGORIES.has(category)) {
    return res.status(400).json({ error: 'Valid designation category is required' });
  }

  const normalizedName = name.toLowerCase();

  const existing = await Designation.findOne(
    req.tenantFilter({ normalizedName })
  );

  if (existing) {
    if (!existing.isActive) {
      existing.isActive = true;
      existing.category = category;
      existing.name = name;
      existing.updatedBy = req.user._id;
      await existing.save();
      return res.json(existing);
    }

    return res.status(409).json({
      error: 'This designation already exists'
    });
  }

  const doc = await Designation.create({
    collegeId: req.collegeId,
    category,
    name,
    normalizedName,
    isSystemDefault: false,
    isActive: true,
    createdBy: req.user._id,
    updatedBy: req.user._id
  });

  await audit(req, 'DESIGNATION_CREATE', 'Designation', doc._id, {
    name: doc.name,
    category: doc.category
  });

  res.status(201).json(doc);
};

exports.update = async (req, res) => {
  const doc = await Designation.findOne(
    req.tenantFilter({ _id: req.params.id })
  );

  if (!doc) {
    return res.status(404).json({ error: 'Designation not found' });
  }

  if (req.body.name !== undefined) {
    const name = cleanName(req.body.name);

    if (!name) {
      return res.status(400).json({ error: 'Designation name is required' });
    }

    const duplicate = await Designation.exists({
      collegeId: req.collegeId,
      normalizedName: name.toLowerCase(),
      _id: { $ne: doc._id }
    });

    if (duplicate) {
      return res.status(409).json({ error: 'This designation already exists' });
    }

    doc.name = name;
    doc.normalizedName = name.toLowerCase();
  }

  if (req.body.category !== undefined) {
    if (!VALID_CATEGORIES.has(req.body.category)) {
      return res.status(400).json({ error: 'Invalid designation category' });
    }

    const employeeCount = await Employee.countDocuments({
      collegeId: req.collegeId,
      designationId: doc._id
    });

    if (employeeCount && req.body.category !== doc.category) {
      return res.status(409).json({
        error: 'Designation category cannot be changed while employees are using it'
      });
    }

    doc.category = req.body.category;
  }

  if (req.body.isActive !== undefined) {
    const makeActive = Boolean(req.body.isActive);

    if (!makeActive) {
      const employeeCount = await Employee.countDocuments({
        collegeId: req.collegeId,
        designationId: doc._id,
        isActive: true
      });

      if (employeeCount) {
        return res.status(409).json({
          error: `${employeeCount} active employee(s) use this designation. Reassign them before disabling it.`
        });
      }
    }

    doc.isActive = makeActive;
  }

  doc.updatedBy = req.user._id;
  await doc.save();

  await audit(req, 'DESIGNATION_UPDATE', 'Designation', doc._id, {
    name: doc.name,
    category: doc.category,
    isActive: doc.isActive
  });

  res.json(doc);
};
