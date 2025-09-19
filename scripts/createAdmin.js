const { sequelize } = require('../src/db');
// Import tất cả models để đăng ký với sequelize
require('../src/models');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function createAdmin() {
  try {
    console.log('🚀 Tạo tài khoản Admin\n');
    
    // Lấy thông tin từ người dùng
    const email = await askQuestion('📧 Nhập email admin: ');
    const password = await askQuestion('🔐 Nhập mật khẩu admin (tối thiểu 6 ký tự): ');
    const name = await askQuestion('👤 Nhập tên admin: ');
    
    // Kiểm tra định dạng email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ Email không hợp lệ!');
      rl.close();
      return;
    }
    
    // Kiểm tra độ dài mật khẩu
    if (password.length < 6) {
      console.log('❌ Mật khẩu phải có ít nhất 6 ký tự!');
      rl.close();
      return;
    }
    
    // Kiểm tra độ dài tên
    if (name.length < 2 || name.length > 50) {
      console.log('❌ Tên phải có từ 2-50 ký tự!');
      rl.close();
      return;
    }
    
    // Kết nối database
    await sequelize.authenticate();
    console.log('\n✅ Kết nối database thành công');
    
    // Lấy User model từ sequelize
    const { User } = sequelize.models;
    
    // Kiểm tra email đã tồn tại chưa
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      console.log('❌ Email này đã được sử dụng!');
      rl.close();
      return;
    }
    
    // Tạo admin user
    const adminUser = await User.create({
      email,
      password,
      name,
      role: 'admin',
      isActive: true,
      theme: 'light',
      language: 'vi'
    });
    
    console.log('\n🎉 Tạo tài khoản admin thành công!');
    console.log('📋 Thông tin admin:');
    console.log(`   ID: ${adminUser.id}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Tên: ${adminUser.name}`);
    console.log(`   Role: ${adminUser.role}`);
    console.log(`   Ngày tạo: ${adminUser.createdAt}`);
    
  } catch (error) {
    console.error('❌ Lỗi khi tạo admin:', error.message);
  } finally {
    rl.close();
    await sequelize.close();
  }
}

// Chạy script
createAdmin();
