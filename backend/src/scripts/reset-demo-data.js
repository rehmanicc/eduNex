require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const db = mongoose.connection.db;
    const collegeId = new mongoose.Types.ObjectId(
      process.env.LOCAL_DEV_COLLEGE_ID
    );

    console.log('Connected to:', db.databaseName);
    console.log('Resetting demo college:', collegeId.toString());

    const collections = await db.listCollections().toArray();
    const names = collections.map(c => c.name);

    console.log('Collections found:', names);

    const preserveCollections = new Set([
      'colleges',
      'roles'
    ]);

    for (const name of names) {
      if (preserveCollections.has(name)) {
        console.log(`Skipping ${name}`);
        continue;
      }

      if (name === 'users') {
        const result = await db.collection(name).deleteMany({
          collegeId,
          email: { $ne: 'director@demo.local' }
        });

        console.log(`users: deleted ${result.deletedCount}`);
        continue;
      }

      const result = await db.collection(name).deleteMany({
        collegeId
      });

      console.log(`${name}: deleted ${result.deletedCount}`);
    }

    await db.collection('users').updateOne(
      {
        collegeId,
        email: 'director@demo.local'
      },
      {
        $set: {
          branchAccess: {
            mode: 'all',
            branchIds: []
          }
        }
      }
    );

    console.log('');
    console.log('Demo reset complete.');
    console.log('Director preserved: director@demo.local');

  } catch (err) {
    console.error('Reset failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();