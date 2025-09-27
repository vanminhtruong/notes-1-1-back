// Debug script để check users trong database
const { sequelize, User } = require('./src/models');

async function debugUsers() {
  try {
    console.log('🔍 Checking all users in database...');
    
    const allUsers = await User.findAll({
      attributes: ['id', 'name', 'email', 'isActive'],
      order: [['id', 'ASC']]
    });
    
    console.log('\n📊 All users:');
    allUsers.forEach(user => {
      console.log(`  ${user.id}: ${user.name} (${user.email}) - Active: ${user.isActive}`);
    });
    
    console.log('\n🟢 Active users only:');
    const activeUsers = allUsers.filter(u => u.isActive);
    activeUsers.forEach(user => {
      console.log(`  ${user.id}: ${user.name} (${user.email})`);
    });
    
    console.log(`\n📈 Total users: ${allUsers.length}`);
    console.log(`📈 Active users: ${activeUsers.length}`);
    
    if (activeUsers.length < 2) {
      console.log('\n⚠️  Warning: Cần ít nhất 2 active users để test sharing!');
      console.log('💡 Tạo thêm users hoặc activate existing users');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

// Chạy script
debugUsers();
