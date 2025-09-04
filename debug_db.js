require('dotenv').config();
const { GroupMember, sequelize } = require('./src/models');

async function checkGroupMembers() {
  try {
    console.log('=== Checking GroupMembers table ===');
    console.log('Database path:', process.env.DB_STORAGE || 'data/app.sqlite');
    
    // Test DB connection
    await sequelize.authenticate();
    console.log('Database connected successfully');
    
    // Check all group members
    const allMembers = await GroupMember.findAll({
      attributes: ['id', 'groupId', 'userId', 'role'],
      raw: true
    });
    console.log('All GroupMembers count:', allMembers.length);
    console.log('All GroupMembers:', JSON.stringify(allMembers, null, 2));
    
    // Check specifically group 2 members with different approaches
    console.log('\n=== Testing group 2 queries ===');
    
    const group2Members1 = await GroupMember.findAll({
      where: { groupId: 2 },
      attributes: ['id', 'groupId', 'userId', 'role'],
      raw: true
    });
    console.log('Group 2 members (number 2):', JSON.stringify(group2Members1, null, 2));
    
    const group2Members2 = await GroupMember.findAll({
      where: { groupId: '2' },
      attributes: ['id', 'groupId', 'userId', 'role'],
      raw: true
    });
    console.log('Group 2 members (string "2"):', JSON.stringify(group2Members2, null, 2));
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkGroupMembers();
