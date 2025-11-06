import { sequelize } from '../src/db/index.js';
import { QueryTypes } from 'sequelize';

async function addAdminPermissionsColumns() {
  try {
    console.log('🔄 Đang thêm các cột adminLevel và adminPermissions...');
    
    // Kiểm tra xem cột adminLevel đã tồn tại chưa
    const adminLevelExists = await sequelize.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'adminLevel'",
      { type: QueryTypes.SELECT }
    );

    if (adminLevelExists.length === 0) {
      // Thêm cột adminLevel với đầy đủ các level
      await sequelize.query(
        "ALTER TABLE Users ADD COLUMN adminLevel ENUM('super_admin', 'sub_admin', 'dev', 'mod') DEFAULT NULL"
      );
      console.log('✅ Đã thêm cột adminLevel');
    } else {
      console.log('ℹ️ Cột adminLevel đã tồn tại');
      // Cập nhật ENUM nếu cần thêm dev và mod
      try {
        await sequelize.query(
          "ALTER TABLE Users MODIFY COLUMN adminLevel ENUM('super_admin', 'sub_admin', 'dev', 'mod') DEFAULT NULL"
        );
        console.log('✅ Đã cập nhật ENUM adminLevel');
      } catch (err) {
        console.log('ℹ️ ENUM adminLevel đã đầy đủ hoặc không thể cập nhật');
      }
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

    // Cập nhật admin hiện tại thành super_admin với đầy đủ quyền
    const [results] = await sequelize.query(`
      UPDATE Users 
      SET adminLevel = 'super_admin',
          adminPermissions = JSON_ARRAY(
            'manage_users',
            'manage_notes',
            'manage_admins',
            'view_dashboard',
            'view_analytics',
            'delete_content',
            'system_settings',
            'profile.self.view',
            'profile.self.edit'
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
if (import.meta.url === `file://${process.argv[1]}`) {
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

export { addAdminPermissionsColumns };
