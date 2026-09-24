require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('../models/Course');

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/college_management';
  await mongoose.connect(uri);
  const indexes = await Course.collection.indexes();
  const old = indexes.find(i => i.unique && JSON.stringify(i.key) === JSON.stringify({ collegeId: 1, code: 1 }));
  if (old) {
    await Course.collection.dropIndex(old.name);
    console.log(`Dropped old Course index: ${old.name}`);
  }
  await Course.syncIndexes();
  console.log('Course indexes synchronized for reusable Subject Master assignments.');
  await mongoose.disconnect();
}

run().catch(async err => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
