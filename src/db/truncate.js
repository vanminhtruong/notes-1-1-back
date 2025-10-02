import { sequelize } from './index.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

async function truncateAllTables() {
  try {
    console.log('Starting to truncate all tables...');
    
    // Get all table names
    const tables = await sequelize.getQueryInterface().showAllTables();
    console.log('Found tables:', tables);
    
    // Disable foreign key constraints temporarily
    await sequelize.query('PRAGMA foreign_keys=OFF;');
    console.log('Foreign key constraints disabled');
    
    // Truncate each table
    for (const table of tables) {
      try {
        await sequelize.query(`DELETE FROM "${table}";`);
        // Reset auto-increment counter
        await sequelize.query(`DELETE FROM sqlite_sequence WHERE name="${table}";`);
        console.log(`✓ Truncated table: ${table}`);
      } catch (error) {
        console.warn(`⚠ Failed to truncate table ${table}:`, error.message);
      }
    }
    
    // Re-enable foreign key constraints
    await sequelize.query('PRAGMA foreign_keys=ON;');
    console.log('Foreign key constraints re-enabled');
    
    console.log('✅ All tables truncated successfully!');
    await sequelize.close();
  } catch (error) {
    console.error('❌ Truncate failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === __filename) {
  truncateAllTables();
}

export { truncateAllTables };
