import { Sequelize } from 'sequelize';
import fs from 'fs';
import path from 'path';

const isTest = process.env.NODE_ENV === 'test';
const storage = isTest ? ':memory:' : process.env.SQLITE_STORAGE || path.join('data', 'app.sqlite');
const logging = process.env.SEQUELIZE_LOG === 'true' ? console.log : false;

if (!isTest && storage !== ':memory:') {
  const dir = path.dirname(storage);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const sequelize = new Sequelize({ dialect: 'sqlite', storage, logging });

export { sequelize };
