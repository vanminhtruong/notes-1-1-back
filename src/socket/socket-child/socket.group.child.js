import { User, GroupMember, GroupMessage, GroupMessageRead } from '../../models/index.js';

class SocketGroupChild {
  constructor(parent) {
    this.parent = parent;
  }

  registerHandlers = (socket, userId) => {
    // Group typing indicator: broadcast to all group members except the sender
    socket.on('group_typing', async (data) => {
      await this.handleGroupTyping(socket, userId, data);
    });

    // Handle group message read receipts
    socket.on('group_message_read', async (data) => {
      await this.handleGroupMessageRead(socket, userId, data);
    });
  };

  handleGroupTyping = async (socket, userId, data) => {
    try {
      const { groupId, isTyping } = data || {};
      if (!groupId) return;
      // Ensure the emitter is a member of the group
      const membership = await GroupMember.findOne({ where: { groupId, userId } });
      if (!membership) return;
      const members = await GroupMember.findAll({ where: { groupId } });
      for (const m of members) {
        const memberId = m.userId;
        if (memberId === userId) continue;
        global.io && global.io.to(`user_${memberId}`).emit('group_typing', {
          groupId,
          userId,
          isTyping: !!isTyping,
        });
      }

      // Notify admins as well for monitoring UI
      try {
        if (global.io) {
          const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
          const payload = { groupId: Number(groupId), userId, userName: socket.user?.name, isTyping: !!isTyping, at: new Date() };
          for (const admin of admins) {
            global.io.to(`user_${admin.id}`).emit('admin_group_typing', payload);
          }
        }
      } catch (e) {
        console.error('Error emitting admin_group_typing:', e);
      }
    } catch (e) {
      console.error('Error handling group_typing:', e);
    }
  };

  handleGroupMessageRead = async (socket, userId, data) => {
    try {
      const { messageId, groupId } = data;
      
      // Check if BOTH current user and message sender have read status enabled
      const message = await GroupMessage.findByPk(messageId);
      if (!message) return;
      
      const currentUser = await User.findByPk(userId);
      const senderUser = await User.findByPk(message.senderId);
      
      if (!currentUser || !senderUser || !currentUser.readStatusEnabled || !senderUser.readStatusEnabled) {
        return; // Don't send read receipts if either user has it disabled
      }
      
      // Verify user is group member
      const membership = await GroupMember.findOne({ 
        where: { groupId, userId } 
      });
      if (!membership) return;

      // Record read receipt with retry for database lock
      let readRecord, created;
      let retries = 3;
      while (retries > 0) {
        try {
          [readRecord, created] = await GroupMessageRead.findOrCreate({
            where: { messageId, userId },
            defaults: { 
              messageId, 
              userId, 
              readAt: new Date() 
            }
          });
          break; // Success, exit retry loop
        } catch (error) {
          retries--;
          if (error.name === 'SequelizeTimeoutError' && error.original?.code === 'SQLITE_BUSY' && retries > 0) {
            console.log(`Database busy, retrying... (${3 - retries}/3)`);
            await new Promise(resolve => setTimeout(resolve, 100 * (3 - retries))); // Exponential backoff
          } else {
            throw error; // Re-throw if not a retry-able error or out of retries
          }
        }
      }

      if (created || readRecord) {
        // Update message status
        await GroupMessage.update(
          { status: 'read' },
          { where: { id: messageId } }
        );

        // Get user info
        const user = await User.findByPk(userId, {
          attributes: ['id', 'name', 'avatar']
        });

        // Notify all group members about read receipt
        const members = await GroupMember.findAll({ where: { groupId } });
        for (const member of members) {
          if (member.userId !== userId) {
            global.io && global.io.to(`user_${member.userId}`).emit('group_message_read', {
              messageId,
              groupId,
              userId,
              readAt: readRecord.readAt,
              user
            });
          }
        }
        // Notify admins for monitoring (Group read)
        try {
          await this.parent.adminChild.emitToAllAdmins('admin_group_message_read', {
            messageId,
            groupId,
            readerId: userId,
            senderId: message.senderId,
            readAt: readRecord.readAt
          });
        } catch (e) {
          console.error('Error emitting admin_group_message_read:', e);
        }
      }
    } catch (error) {
      console.error('Error handling group_message_read:', error);
    }
  };
}

export default SocketGroupChild;
