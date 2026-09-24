const mongoose = require('mongoose');

async function connectDB() {
  mongoose.set('strictQuery', true);

  // Building/checking every schema index during each production startup adds
  // unnecessary database work. Production indexes are managed explicitly via
  // `npm run db:ensure-indexes`; development keeps Mongoose's normal behavior.
  const autoIndex = process.env.NODE_ENV !== 'production';

  await mongoose.connect(process.env.MONGO_URI, { autoIndex });
  console.log(`MongoDB connected (autoIndex: ${autoIndex})`);
}

module.exports = connectDB;
