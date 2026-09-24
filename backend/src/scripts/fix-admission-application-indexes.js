require('dotenv').config();
const mongoose = require('mongoose');
const AdmissionApplication = require('../models/AdmissionApplication');

async function dropIfPresent(collection, index) {
  try {
    await collection.dropIndex(index.name);
    console.log(`Dropped index: ${index.name}`);
  } catch (err) {
    if (err?.codeName === 'IndexNotFound' || err?.code === 27) {
      console.log(`Index already absent: ${index.name}`);
      return;
    }
    throw err;
  }
}

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/college_management';
  await mongoose.connect(uri);
  console.log(`Connected to MongoDB: ${mongoose.connection.name}`);

  const collection = mongoose.connection.collection('admissionapplications');
  const indexes = await collection.indexes();

  // Remove legacy/incorrect compound unique indexes. A normal unique index treats
  // missing values like null, and a sparse unique index still indexes an explicit
  // null. Both can therefore block a second application before formNo/rollNo exists.
  for (const index of indexes) {
    const key = index.key || {};
    const isLegacyApplicationNo = key.collegeId === 1 && key.applicationNo === 1;
    const isFormNoCompound = key.collegeId === 1 && key.formNo === 1;
    const isRollNoCompound = key.collegeId === 1 && key.rollNo === 1;

    if (isLegacyApplicationNo || isFormNoCompound || isRollNoCompound) {
      await dropIfPresent(collection, index);
    }
  }

  // Clean old explicit nulls so unfinished applications are represented consistently.
  const formCleanup = await collection.updateMany(
    { formNo: null },
    { $unset: { formNo: '' } }
  );
  const rollCleanup = await collection.updateMany(
    { rollNo: null },
    { $unset: { rollNo: '' } }
  );
  console.log(`Unset null formNo on ${formCleanup.modifiedCount} record(s).`);
  console.log(`Unset null rollNo on ${rollCleanup.modifiedCount} record(s).`);

  // Recreate the indexes declared by the corrected model. formNo/rollNo are unique
  // only when they are actual strings; any number of unfinished records may coexist.
  await AdmissionApplication.createIndexes();

  const finalIndexes = await collection.indexes();
  console.log('\nAdmissionApplication indexes now:');
  finalIndexes.forEach(index => {
    const partial = index.partialFilterExpression
      ? ` partial=${JSON.stringify(index.partialFilterExpression)}`
      : '';
    console.log(` - ${index.name}${partial}`);
  });

  console.log('\nAdmission application index repair completed successfully.');
}

main()
  .catch(err => {
    console.error('Admission application index repair failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
