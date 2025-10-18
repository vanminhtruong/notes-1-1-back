import { sequelize } from '../src/db/index.js';

async function checkTables() {
  try {
    const qi = sequelize.getQueryInterface();
    const tables = await qi.showAllTables();
    
    console.log('📋 Existing tables:');
    tables.forEach(table => console.log(`  - ${table}`));
    
    if (tables.includes('NoteTags')) {
      console.log('\n✅ NoteTags table exists');
      const columns = await qi.describeTable('NoteTags');
      console.log('   Columns:', Object.keys(columns).join(', '));
    } else {
      console.log('\n❌ NoteTags table does NOT exist');
    }
    
    if (tables.includes('NoteTagMappings')) {
      console.log('\n✅ NoteTagMappings table exists');
      const columns = await qi.describeTable('NoteTagMappings');
      console.log('   Columns:', Object.keys(columns).join(', '));
    } else {
      console.log('\n❌ NoteTagMappings table does NOT exist');
    }
    
    await sequelize.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkTables();
