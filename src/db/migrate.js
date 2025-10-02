import { sequelize } from './index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  try {
    console.log('Starting database migrations...');
    
    // Get all migration files
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js'))
      .sort();

    for (const file of migrationFiles) {
      console.log(`Running migration: ${file}`);
      const migration = await import(path.join(migrationsDir, file));
      
      if (migration.up) {
        await migration.up(sequelize.getQueryInterface(), sequelize.constructor);
        console.log(`✓ Migration ${file} completed`);
      }
    }
    
    console.log('All migrations completed successfully!');
    await sequelize.close();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === __filename) {
  runMigrations();
}

export { runMigrations };
