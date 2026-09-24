require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }

  // This command creates schema-declared indexes that are missing. Unlike
  // syncIndexes(), it does not drop database indexes that are absent in code.
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });

  const modelsDir = path.join(__dirname, '..', 'models');
  const modelFiles = fs
    .readdirSync(modelsDir)
    .filter((name) => name.endsWith('.js'))
    .sort();

  for (const file of modelFiles) {
    require(path.join(modelsDir, file));
  }

  const models = Object.values(mongoose.models).sort((a, b) =>
    a.modelName.localeCompare(b.modelName)
  );

  const result = {
    database: mongoose.connection.name,
    modelsChecked: models.length,
    succeeded: [],
    failed: [],
  };

  for (const Model of models) {
    try {
      await Model.createIndexes();
      result.succeeded.push(Model.modelName);
    } catch (error) {
      result.failed.push({
        model: Model.modelName,
        message: error.message,
      });
    }
  }

  console.log(JSON.stringify(result, null, 2));

  if (result.failed.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
