require('dotenv').config();
const mongoose = require('mongoose');

const CONFIRM = '--yes';

function argValue(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((v) => v.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : '';
}

async function main() {
  if (!process.argv.includes(CONFIRM)) {
    console.log('');
    console.log('====================================================');
    console.log('  DESTRUCTIVE PRE-RELEASE DATABASE RESET');
    console.log('====================================================');
    console.log('');
    console.log('This will DELETE ALL CollegeCMS data except ONE');
    console.log('Platform Owner user account.');
    console.log('');
    console.log('It removes colleges, directors, admins, roles, branches,');
    console.log('wings, academics, students, employees, fees, attendance,');
    console.log('timetables, settings, logs, sequences and all other data.');
    console.log('');
    console.log('Run:');
    console.log('  node src/scripts/reset-keep-platform-owner.js --yes');
    console.log('');
    console.log('If more than one Platform Owner exists, specify the one to keep:');
    console.log('  node src/scripts/reset-keep-platform-owner.js --yes --email=owner@example.com');
    console.log('');
    process.exit(0);
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing from .env');
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`Connected to: ${db.databaseName}`);

  const collections = (await db.listCollections().toArray()).map((x) => x.name);
  if (!collections.includes('users')) {
    throw new Error('ABORTED: users collection does not exist.');
  }

  const users = db.collection('users');
  const requestedEmail = argValue('--email').toLowerCase();

  const ownerFilter = { systemRole: 'platform_owner' };
  if (requestedEmail) ownerFilter.email = requestedEmail;

  const owners = await users.find(ownerFilter).toArray();

  if (owners.length === 0) {
    throw new Error(
      requestedEmail
        ? `ABORTED: No Platform Owner found with email ${requestedEmail}.`
        : 'ABORTED: No Platform Owner account was detected.'
    );
  }

  if (!requestedEmail && owners.length !== 1) {
    console.log('');
    console.log('Platform Owner accounts found:');
    for (const owner of owners) console.log(`  ${owner.email || owner._id}`);
    throw new Error(
      'ABORTED: More than one Platform Owner exists. Re-run with --email=<email> to choose the single account to preserve.'
    );
  }

  if (requestedEmail && owners.length !== 1) {
    throw new Error('ABORTED: Expected exactly one matching Platform Owner account.');
  }

  const owner = owners[0];
  const ownerId = owner._id;

  console.log('');
  console.log(`Keeping Platform Owner: ${owner.email || owner.name || ownerId}`);
  console.log(`Owner ID: ${ownerId}`);
  console.log('');
  console.log('Deleting all other database content...');
  console.log('');

  let totalDeleted = 0;

  for (const collectionName of collections) {
    if (collectionName.startsWith('system.')) continue;

    const collection = db.collection(collectionName);
    let result;

    if (collectionName === 'users') {
      result = await collection.deleteMany({ _id: { $ne: ownerId } });
    } else {
      result = await collection.deleteMany({});
    }

    totalDeleted += result.deletedCount || 0;
    console.log(`${collectionName.padEnd(32)} deleted: ${result.deletedCount || 0}`);
  }

  // Remove any tenant/role/entity references from the preserved owner so the
  // surviving account is a clean platform-level login with no dangling IDs.
  await users.updateOne(
    { _id: ownerId },
    {
      $set: {
        collegeId: null,
        systemRole: 'platform_owner',
        roleIds: [],
        branchAccess: { mode: 'all', branchIds: [] },
        linkedStudentId: null,
        linkedEmployeeId: null,
        isActive: true,
      },
    }
  );

  const remainingUsers = await users.find({}).toArray();

  if (remainingUsers.length !== 1 || String(remainingUsers[0]._id) !== String(ownerId)) {
    throw new Error('RESET VALIDATION FAILED: Expected exactly one Platform Owner user to remain.');
  }

  const nonUserCounts = [];
  for (const collectionName of collections) {
    if (collectionName.startsWith('system.') || collectionName === 'users') continue;
    const count = await db.collection(collectionName).countDocuments();
    if (count !== 0) nonUserCounts.push(`${collectionName}: ${count}`);
  }

  if (nonUserCounts.length) {
    throw new Error(`RESET VALIDATION FAILED: Non-empty collections remain: ${nonUserCounts.join(', ')}`);
  }

  console.log('');
  console.log('====================================================');
  console.log('RESET COMPLETE');
  console.log('====================================================');
  console.log(`Total documents deleted: ${totalDeleted}`);
  console.log('Remaining users: 1');
  console.log(`Platform Owner: ${remainingUsers[0].email || remainingUsers[0]._id}`);
  console.log('All other application collections are empty.');
  console.log('');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('');
  console.error('RESET FAILED:');
  console.error(err.message);
  console.error('');
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
