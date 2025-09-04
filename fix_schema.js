require('dotenv').config();
const { sequelize } = require('./src/models');

async function fixGroupMemberConstraints() {
  try {
    console.log('🔧 Fixing GroupMember constraints...');
    
    // Drop the table and recreate with correct constraints
    await sequelize.query('DROP TABLE IF EXISTS `GroupMembers`;');
    console.log('✓ Dropped GroupMembers table');
    
    // Force sync models to recreate table with correct constraints
    await sequelize.sync({ force: true });
    console.log('✓ Recreated all tables with correct constraints');
    
    // Check the new schema
    const [results] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='GroupMembers';");
    console.log('New GroupMembers schema:', results[0]?.sql);
    
    await sequelize.close();
    console.log('✅ Schema fixed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixGroupMemberConstraints();
