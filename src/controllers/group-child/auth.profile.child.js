import { User, Friendship } from '../../models/index.js';
import { emitToAllAdmins } from '../../socket/socketHandler.js';
import { Op } from 'sequelize';

class AuthProfileChild {
  constructor(parentController) {
    this.parent = parentController;
  }

  getProfile = async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id, {
        include: [{
          association: 'notes',
          attributes: ['id', 'title', 'createdAt'],
        }],
      });

      res.json({
        user,
        totalNotes: user.notes.length,
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  updateProfile = async (req, res) => {
    try {
      const { name, avatar, phone, birthDate, gender } = req.body;
      const user = req.user;

      const updates = {};
      if (typeof name === 'string' && name.trim()) updates.name = name.trim();
      if (typeof avatar === 'string') {
        const t = avatar.trim();
        updates.avatar = t ? t : null; // empty string clears avatar
      }
      if (typeof phone !== 'undefined') {
        if (phone === '' || phone === null) updates.phone = null; else updates.phone = String(phone).trim();
      }
      if (typeof birthDate !== 'undefined') {
        updates.birthDate = birthDate ? birthDate : null;
      }
      if (typeof gender === 'string') {
        updates.gender = gender;
      }

      await user.update(updates);

      // Emit profile update to all connected friends for real-time sync
      try {
        const friendships = await Friendship.findAll({
          where: {
            [Op.or]: [
              { requesterId: user.id, status: 'accepted' },
              { addresseeId: user.id, status: 'accepted' }
            ]
          }
        });

        for (const friendship of friendships) {
          const friendId = friendship.requesterId === user.id ? friendship.addresseeId : friendship.requesterId;
          if (friendId && global.io) {
            global.io.to(`user_${friendId}`).emit('user_profile_updated', {
              userId: user.id,
              user: {
                id: user.id,
                name: user.name,
                avatar: user.avatar,
                phone: user.phone,
                birthDate: user.birthDate,
                gender: user.gender,
                email: user.email,
                isOnline: true // Assume online since they just updated
              }
            });
          }
        }
      } catch (emitError) {
        console.error('Error emitting profile update:', emitError);
      }

      // Also emit to all admins so Admin Users List and User Activity update in real-time
      try {
        await emitToAllAdmins('admin_user_updated', {
          userId: user.id,
          user: {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            phone: user.phone,
            birthDate: user.birthDate,
            gender: user.gender,
            email: user.email,
            isActive: user.isActive,
          },
          at: new Date(),
        });
      } catch (e) {
        console.error('Error emitting admin_user_updated:', e);
      }

      res.json({
        message: 'Cập nhật thông tin thành công',
        user,
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  changePassword = async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = req.user;

      // Validate current password
      const isValidPassword = await user.validatePassword(currentPassword);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
      }

      // Update password
      await user.update({ password: newPassword });

      res.json({ message: 'Đổi mật khẩu thành công' });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
}

export default AuthProfileChild;
