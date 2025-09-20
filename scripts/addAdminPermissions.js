const { sequelize } = require('../src/db');
const { QueryTypes } = require('sequelize');

async function addAdminPermissionsColumns() {
  try {
    console.log('🔄 Đang thêm các cột adminLevel và adminPermissions...');
    
    // Kiểm tra xem cột adminLevel đã tồn tại chưa
    const adminLevelExists = await sequelize.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'adminLevel'",
      { type: QueryTypes.SELECT }
    );

    if (adminLevelExists.length === 0) {
      // Thêm cột adminLevel
      await sequelize.query(
        "ALTER TABLE Users ADD COLUMN adminLevel ENUM('super_admin', 'sub_admin') DEFAULT NULL"
      );
      console.log('✅ Đã thêm cột adminLevel');
    } else {
      console.log('ℹ️ Cột adminLevel đã tồn tại');
    }

    // Kiểm tra xem cột adminPermissions đã tồn tại chưa
    const adminPermissionsExists = await sequelize.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'adminPermissions'",
      { type: QueryTypes.SELECT }
    );

    if (adminPermissionsExists.length === 0) {
      // Thêm cột adminPermissions
      await sequelize.query(
        "ALTER TABLE Users ADD COLUMN adminPermissions JSON DEFAULT NULL"
      );
      console.log('✅ Đã thêm cột adminPermissions');
    } else {
      console.log('ℹ️ Cột adminPermissions đã tồn tại');
    }

    // Cập nhật admin hiện tại thành super_admin
    const [results] = await sequelize.query(`
      UPDATE Users 
      SET adminLevel = 'super_admin',
          adminPermissions = JSON_ARRAY(
            'manage_users', 'manage_notes', 'manage_admins', 
            'view_analytics', 'manage_groups', 'view_messages',
            'delete_content', 'system_settings'
          )
      WHERE role = 'admin' AND adminLevel IS NULL
    `);
    
    if (results.affectedRows > 0) {
      console.log(`✅ Đã cập nhật ${results.affectedRows} admin hiện tại thành super_admin`);
    }

    console.log('🎉 Hoàn thành migration admin permissions!');
  } catch (error) {
    console.error('❌ Lỗi khi thêm admin permissions:', error);
    throw error;
  }
}

// Chạy migration nếu file được gọi trực tiếp
if (require.main === module) {
  addAdminPermissionsColumns()
    .then(() => {
      console.log('✅ Migration hoàn thành');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration thất bại:', error);
      process.exit(1);
    });
}

module.exports = { addAdminPermissionsColumns };
