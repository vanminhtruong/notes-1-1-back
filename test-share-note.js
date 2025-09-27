// Test script để tạo shared notes
// Chạy: node test-share-note.js

const { sequelize, Note, User, SharedNote } = require('./src/models');

async function createTestSharedNotes() {
  try {
    console.log('🔄 Đang tạo dữ liệu test cho shared notes...');

    // Tạo 2 users test nếu chưa có
    const [user1] = await User.findOrCreate({
      where: { email: 'user1@test.com' },
      defaults: {
        name: 'User 1',
        email: 'user1@test.com',
        password: 'password123',
        isActive: true
      }
    });

    const [user2] = await User.findOrCreate({
      where: { email: 'user2@test.com' },
      defaults: {
        name: 'User 2',
        email: 'user2@test.com',
        password: 'password123',
        isActive: true
      }
    });

    console.log(`✅ Users created: ${user1.name} (ID: ${user1.id}), ${user2.name} (ID: ${user2.id})`);

    // Tạo một note cho user1
    const note1 = await Note.create({
      title: 'Ghi chú test chia sẻ',
      content: 'Đây là nội dung ghi chú test để chia sẻ với user khác',
      category: 'test',
      priority: 'medium',
      userId: user1.id
    });

    console.log(`✅ Note created: "${note1.title}" (ID: ${note1.id})`);

    // Tạo shared note: user1 chia sẻ với user2
    const sharedNote = await SharedNote.create({
      noteId: note1.id,
      sharedWithUserId: user2.id,
      sharedByUserId: user1.id,
      canEdit: true,
      canDelete: false,
      message: 'Chia sẻ ghi chú này để cùng làm việc!',
      isActive: true
    });

    console.log(`✅ Shared note created: ID ${sharedNote.id}`);

    // Tạo thêm một note khác và share
    const note2 = await Note.create({
      title: 'Kế hoạch dự án',
      content: 'Chi tiết về kế hoạch thực hiện dự án mới',
      category: 'work',
      priority: 'high',
      userId: user1.id
    });

    const sharedNote2 = await SharedNote.create({
      noteId: note2.id,
      sharedWithUserId: user2.id,
      sharedByUserId: user1.id,
      canEdit: false,
      canDelete: false,
      message: 'Xem và góp ý cho kế hoạch này nhé!',
      isActive: true
    });

    console.log(`✅ Second shared note created: ID ${sharedNote2.id}`);

    // Hiển thị thống kê
    const totalSharedNotes = await SharedNote.count({ where: { isActive: true } });
    console.log(`\n📊 Tổng cộng có ${totalSharedNotes} shared notes`);
    
    console.log('\n🎉 Hoàn thành! Bây giờ bạn có thể kiểm tra tab "Chia sẻ" trong admin panel.');
    console.log('\n📝 Dữ liệu test đã tạo:');
    console.log(`   • ${user1.name} chia sẻ "${note1.title}" cho ${user2.name} (có quyền edit)`);
    console.log(`   • ${user1.name} chia sẻ "${note2.title}" cho ${user2.name} (chỉ xem)`);

  } catch (error) {
    console.error('❌ Lỗi khi tạo dữ liệu test:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

// Chạy script
createTestSharedNotes();
