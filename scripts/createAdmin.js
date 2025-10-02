import { sequelize } from '../src/db/index.js';
// Import tất cả models để đăng ký với sequelize
import '../src/models/index.js';
import readline from 'readline';

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
    console.log('🚀 Tạo tài khoản Super Admin\n');
    
    // Lấy thông tin từ người dùng
    const email = await askQuestion('📧 Nhập email super admin: ');
    const password = await askQuestion('🔐 Nhập mật khẩu super admin (tối thiểu 6 ký tự): ');
    const name = await askQuestion('👤 Nhập tên super admin: ');
    
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
    
    // Danh sách tất cả quyền hạn có sẵn
    const allPermissions = [
      'manage_users',
      'manage_notes', 
      'manage_admins',
      'view_analytics',
      'manage_groups',
      'view_messages',
      'delete_content',
      'system_settings'
    ];

    // Tạo super admin user
    const adminUser = await User.create({
      email,
      password,
      name,
      role: 'admin',
      adminLevel: 'super_admin',
      adminPermissions: allPermissions,
      isActive: true,
      theme: 'light',
      language: 'vi'
    });
    
    console.log('\n🎉 Tạo tài khoản Super Admin thành công!');
    console.log('📋 Thông tin Super Admin:');
    console.log(`   ID: ${adminUser.id}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Tên: ${adminUser.name}`);
    console.log(`   Role: ${adminUser.role}`);
    console.log(`   Admin Level: ${adminUser.adminLevel}`);
    console.log(`   Quyền hạn: ${adminUser.adminPermissions.join(', ')}`);
    console.log(`   Ngày tạo: ${adminUser.createdAt}`);
    
  } catch (error) {
    console.error('❌ Lỗi khi tạo super admin:', error.message);
  } finally {
    rl.close();
    await sequelize.close();
  }
}

// Chạy script
createAdmin();
