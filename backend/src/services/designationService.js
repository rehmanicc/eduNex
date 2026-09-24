const Designation = require('../models/Designation');

const DEFAULT_DESIGNATIONS = Object.freeze({
  non_teaching_staff: [
    'Accountant',
    'Office Assistant',
    'Sweeper',
    'Peon',
    'Gardener',
    'Security Guard',
    'Driver',
    'FDO',
    'Admission Officer'
  ],
  academic_staff: [
    'Principal',
    'Vice Principal',
    'Librarian',
    'Exam Controller',
    'ISA',
    'Lecturer',
    'Teacher',
    'Teacher Assistant',
    'Lab Attendant'
  ]
});

async function seedDefaultDesignations(collegeId) {
  const output = [];

  for (const [category, names] of Object.entries(DEFAULT_DESIGNATIONS)) {
    for (const name of names) {
      const normalizedName = name.toLowerCase();

      const designation = await Designation.findOneAndUpdate(
        { collegeId, normalizedName },
        {
          $setOnInsert: {
            collegeId,
            category,
            name,
            normalizedName,
            isSystemDefault: true,
            isActive: true
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      output.push(designation);
    }
  }

  return output;
}

module.exports = {
  DEFAULT_DESIGNATIONS,
  seedDefaultDesignations
};
