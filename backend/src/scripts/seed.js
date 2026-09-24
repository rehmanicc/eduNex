require('dotenv').config();

const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/User');

(async () => {
  await connectDB();

  const ownerEmail = 'rehmanicc@gmail.com';
  const ownerPassword = 'Rehman321269!';

  const existingOwner = await User.findOne({
    email: ownerEmail,
    collegeId: null,
  });

  if (!existingOwner) {
    await User.create({
      name: 'Platform Owner',
      email: ownerEmail,
      passwordHash: await bcrypt.hash(ownerPassword, 12),
      systemRole: 'platform_owner',
    });

    console.log('Platform owner created');
  } else {
    console.log('Platform owner already exists');
  }

  console.log('Seed complete');
  console.log(`Platform owner: ${ownerEmail} / ${ownerPassword}`);
  console.log('No demo college, director, academic session, or college roles were seeded.');

  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
