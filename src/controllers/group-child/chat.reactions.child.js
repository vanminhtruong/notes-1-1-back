const { User, Message, MessageReaction, BlockedUser } = require('../../models');
const asyncHandler = require('../../middlewares/asyncHandler');
const { Op } = require('sequelize');

class ChatReactionsChild {
  constructor(parentController) {
    this.parent = parentController;
  }

  reactMessage = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { messageId } = req.params;
    const { type } = req.body || {};

    const msg = await Message.findByPk(messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    if (msg.senderId !== currentUserId && msg.receiverId !== currentUserId) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    try {
      const otherUserId = msg.senderId === currentUserId ? msg.receiverId : msg.senderId;
      const blocked = await BlockedUser.findOne({
        where: {
          [Op.or]: [
            { userId: currentUserId, blockedUserId: otherUserId },
            { userId: otherUserId, blockedUserId: currentUserId },
          ],
        },
      });
      if (blocked) {
        return res.status(403).json({ success: false, message: 'Messaging is blocked between you and this user' });
      }
    } catch {}

    const existingSame = await MessageReaction.findOne({ where: { userId: currentUserId, messageId, type } });
    if (existingSame) {
      await existingSame.increment('count', { by: 1 });
      await existingSame.update({ reactedAt: new Date() });
    } else {
      let removedType = null;
      const list = await MessageReaction.findAll({ where: { userId: currentUserId, messageId }, order: [['reactedAt', 'ASC']] });
      if (list.length >= 3) {
        try { removedType = list[2].type; await list[2].destroy(); } catch {}
      }
      await MessageReaction.findOrCreate({
        where: { userId: currentUserId, messageId, type },
        defaults: { userId: currentUserId, messageId, type, count: 1 }
      });
      
      try {
        if (removedType) {
          const io = req.app.get('io') || global.io;
          const payloadUnreact = { messageId: Number(messageId), userId: currentUserId, type: removedType };
          if (io) {
            io.to(`user_${msg.senderId}`).emit('message_unreacted', payloadUnreact);
            io.to(`user_${msg.receiverId}`).emit('message_unreacted', payloadUnreact);
            // Notify admins as well so Monitor cập nhật realtime
            try {
              const { emitToAllAdmins } = require('../../socket/socketHandler');
              emitToAllAdmins && emitToAllAdmins('admin_dm_message_unreacted', { ...payloadUnreact });
            } catch (e) { /* noop */ }
          }
        }
      } catch {}
    }

    try {
      const current = await MessageReaction.findOne({ where: { userId: currentUserId, messageId, type } });
      const userInfo = await User.findByPk(currentUserId, { attributes: ['id', 'name', 'avatar'] });
      const payload = { messageId: Number(messageId), userId: currentUserId, type, count: current?.count ?? 1, user: userInfo };
      const a = msg.senderId, b = msg.receiverId;
      const io = req.app.get('io') || global.io;
      if (io) {
        io.to(`user_${a}`).emit('message_reacted', payload);
        io.to(`user_${b}`).emit('message_reacted', payload);
        // Emit to admins for monitoring (DM reaction)
        try {
          const { emitToAllAdmins } = require('../../socket/socketHandler');
          emitToAllAdmins && emitToAllAdmins('admin_dm_message_reacted', { ...payload });
        } catch (e) { /* noop */ }
      }
    } catch {}

    return res.json({ success: true, data: { messageId: Number(messageId), type } });
  });

  unreactMessage = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { messageId } = req.params;
    const { type } = req.query || {};

    const msg = await Message.findByPk(messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    if (msg.senderId !== currentUserId && msg.receiverId !== currentUserId) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    try {
      const otherUserId = msg.senderId === currentUserId ? msg.receiverId : msg.senderId;
      const blocked = await BlockedUser.findOne({
        where: {
          [Op.or]: [
            { userId: currentUserId, blockedUserId: otherUserId },
            { userId: otherUserId, blockedUserId: currentUserId },
          ],
        },
      });
      if (blocked) {
        return res.status(403).json({ success: false, message: 'Messaging is blocked between you and this user' });
      }
    } catch {}

    const where = { userId: currentUserId, messageId };
    if (type) where.type = type;
    await MessageReaction.destroy({ where });

    try {
      const payload = { messageId: Number(messageId), userId: currentUserId, ...(type ? { type } : {}) };
      const io = req.app.get('io') || global.io;
      if (io) {
        io.to(`user_${msg.senderId}`).emit('message_unreacted', payload);
        io.to(`user_${msg.receiverId}`).emit('message_unreacted', payload);
        // Emit to admins for monitoring (DM unreact)
        try {
          const { emitToAllAdmins } = require('../../socket/socketHandler');
          emitToAllAdmins && emitToAllAdmins('admin_dm_message_unreacted', { ...payload });
        } catch (e) { /* noop */ }
      }
    } catch {}

    return res.json({ success: true, data: { messageId: Number(messageId), ...(type ? { type } : {}) } });
  });
}

module.exports = ChatReactionsChild;
