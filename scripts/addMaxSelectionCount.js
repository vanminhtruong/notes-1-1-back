import { sequelize } from '../src/db/index.js';

async function addMaxSelectionCount() {
  try {
    console.log('Adding maxSelectionCount column to NoteCategories...');
    
    await sequelize.query(`
      ALTER TABLE NoteCategories 
      ADD COLUMN maxSelectionCount INTEGER NOT NULL DEFAULT 0;
    `);
    
    console.log('✓ Successfully added maxSelectionCount column');
    process.exit(0);
  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      console.log('✓ Column maxSelectionCount already exists');
      process.exit(0);
    }
    console.error('Error adding column:', error);
    process.exit(1);
  }
}

addMaxSelectionCount();
