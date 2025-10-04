import { Note, User, SharedNote, Group, GroupSharedNote, GroupMember } from '../../models/index.js';
import { Op } from 'sequelize';
import { emitToUser, emitToAllAdmins } from '../../socket/socketHandler.js';

class NotesSharingChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Share a note with another user
  shareNote = async (req, res) => {
    try {
      const { id } = req.params; // note id
      const { userId: sharedWithUserId, canEdit = false, canDelete = false, canCreate = false, message, messageId } = req.body;
      const sharedByUserId = req.user.id;

      // Check if note exists and belongs to the user
      const note = await Note.findOne({ 
        where: { id, userId: sharedByUserId },
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }]
      });

      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú hoặc bạn không có quyền chia sẻ ghi chú này' });
      }

      // Check if already shared with this user
      const existingShare = await SharedNote.findOne({
        where: { noteId: id, sharedWithUserId, isActive: true }
      });

      if (existingShare) {
        return res.status(400).json({ message: 'Ghi chú đã được chia sẻ với người dùng này' });
      }

      const sharedNote = await SharedNote.create({
        noteId: id,
        sharedWithUserId,
        sharedByUserId,
        canEdit,
        canDelete,
        canCreate,
        message,
        messageId: messageId || null,
      });

      // Get complete shared note data for response
      const completeSharedNote = await SharedNote.findByPk(sharedNote.id, {
        include: [
          { 
            model: Note, 
            as: 'note',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }]
          },
          { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email', 'avatar'] },
          { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] }
        ]
      });

      // Emit real-time events
      emitToUser(sharedWithUserId, 'note_shared_with_me', completeSharedNote);
      emitToUser(sharedByUserId, 'note_shared_by_me', completeSharedNote);
      emitToAllAdmins('user_shared_note_created', completeSharedNote);

      res.status(201).json({
        message: 'Chia sẻ ghi chú thành công',
        sharedNote: completeSharedNote
      });
    } catch (error) {
      console.error('Error sharing note:', error);
      res.status(400).json({ message: error.message });
    }
  };

  // Get notes shared with me
  getSharedWithMe = async (req, res) => {
    try {
      const userId = req.user.id;
      const { 
        page = 1, 
        limit = 10, 
        search,
        sortBy = 'sharedAt',
        sortOrder = 'DESC'
      } = req.query;

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const offset = (pageNum - 1) * limitNum;

      const whereClause = { sharedWithUserId: userId, isActive: true };

      // Search in note title or content
      let noteWhere = {};
      if (search) {
        noteWhere = {
          [Op.or]: [
            { title: { [Op.like]: `%${search}%` } },
            { content: { [Op.like]: `%${search}%` } },
          ]
        };
      }

      const { count, rows: sharedNotes } = await SharedNote.findAndCountAll({
        where: whereClause,
        include: [
          { 
            model: Note, 
            as: 'note', 
            where: search ? noteWhere : undefined,
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }]
          },
          { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] }
        ],
        order: [[sortBy, sortOrder]],
        limit: limitNum,
        offset,
      });

      res.json({
        sharedNotes,
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum),
        },
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  // Get notes I shared with others
  getSharedByMe = async (req, res) => {
    try {
      const userId = req.user.id;
      const { 
        page = 1, 
        limit = 10, 
        search,
        sortBy = 'sharedAt',
        sortOrder = 'DESC'
      } = req.query;

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const offset = (pageNum - 1) * limitNum;

      const whereClause = { sharedByUserId: userId, isActive: true };

      // Search in note title or content
      let noteWhere = {};
      if (search) {
        noteWhere = {
          [Op.or]: [
            { title: { [Op.like]: `%${search}%` } },
            { content: { [Op.like]: `%${search}%` } },
          ]
        };
      }

      const { count, rows: sharedNotes } = await SharedNote.findAndCountAll({
        where: whereClause,
        include: [
          { 
            model: Note, 
            as: 'note', 
            where: search ? noteWhere : undefined,
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }]
          },
          { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email', 'avatar'] }
        ],
        order: [[sortBy, sortOrder]],
        limit: limitNum,
        offset,
      });

      res.json({
        sharedNotes,
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum),
        },
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  // Remove shared note (only by sharer or receiver)
  removeSharedNote = async (req, res) => {
    try {
      const { id } = req.params; // shared note id
      const userId = req.user.id;

      const sharedNote = await SharedNote.findByPk(id, {
        include: [
          { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email', 'avatar'] },
          { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] }
        ]
      });

      if (!sharedNote) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú chia sẻ' });
      }

      // Only sharer or receiver can remove
      if (sharedNote.sharedByUserId !== userId && sharedNote.sharedWithUserId !== userId) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa chia sẻ này' });
      }

      const payload = { id: sharedNote.id, noteId: sharedNote.noteId, messageId: sharedNote.messageId };

      await sharedNote.destroy();

      // Emit real-time events to both sides and current user's other devices
      emitToUser(userId, 'shared_note_removed', payload);
      if (sharedNote.sharedByUserId !== userId) {
        emitToUser(sharedNote.sharedByUserId, 'shared_note_removed', payload);
      }
      if (sharedNote.sharedWithUserId !== userId) {
        emitToUser(sharedNote.sharedWithUserId, 'shared_note_removed', payload);
      }
      emitToAllAdmins('user_shared_note_deleted', { 
        id: sharedNote.id, 
        sharedWithUserId: sharedNote.sharedWithUserId,
        sharedByUserId: sharedNote.sharedByUserId 
      });

      res.json({ message: 'Xóa chia sẻ ghi chú thành công' });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  // Get list of users for sharing (simple implementation)
  getUsers = async (req, res) => {
    try {
      const { limit = 50, search } = req.query;
      const currentUserId = req.user.id;
      
      console.log('🔍 Getting users for sharing. Current user ID:', currentUserId);
      
      let whereClause = { 
        id: { [Op.ne]: currentUserId }, // Exclude current user
        isActive: true,
        role: 'user' // Only include regular users, not admins
      };
      
      if (search) {
        whereClause[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } }
        ];
      }

      console.log('🔍 Where clause:', whereClause);

      const users = await User.findAll({
        where: whereClause,
        attributes: ['id', 'name', 'email', 'avatar'],
        limit: parseInt(limit),
        order: [['name', 'ASC']]
      });

      console.log('🔍 Found users:', users.length, users.map(u => ({ id: u.id, name: u.name })));

      res.json({ users });
    } catch (error) {
      console.error('Error getting users:', error);
      res.status(400).json({ message: error.message });
    }
  };

  // Get shared note permissions for current user
  getSharedNotePermissions = async (req, res) => {
    try {
      const { noteId } = req.params;
      const userId = req.user.id;

      console.log(`🔍 Getting permissions for note ${noteId}, user ${userId}`);

      // First check if note exists
      const note = await Note.findByPk(noteId);
      if (!note) {
        console.log(`❌ Note ${noteId} does not exist`);
        return res.status(404).json({ message: 'Note not found' });
      }

      console.log(`✅ Note ${noteId} exists, owner: ${note.userId}`);

      // Check if note belongs to current user (owner has full permissions)
      if (note.userId === userId) {
        console.log(`✅ User ${userId} is owner of note ${noteId}`);
        return res.json({
          canEdit: true,
          canDelete: true,
          isOwner: true
        });
      }

      // Debug: Check all shared notes for this note
      const allSharedNotes = await SharedNote.findAll({
        where: { noteId: noteId },
        attributes: ['id', 'sharedWithUserId', 'canEdit', 'canDelete', 'isActive']
      });
      console.log(`📋 All shared notes for note ${noteId}:`, allSharedNotes.map(sn => ({
        id: sn.id,
        sharedWithUserId: sn.sharedWithUserId,
        canEdit: sn.canEdit,
        canDelete: sn.canDelete,
        isActive: sn.isActive
      })));

      // Check shared permissions
      const sharedNote = await SharedNote.findOne({
        where: {
          noteId: noteId,
          sharedWithUserId: userId,
          isActive: true
        },
        attributes: ['id', 'canEdit', 'canDelete', 'canCreate']
      });

      if (!sharedNote) {
        console.log(`❌ No active shared note found for note ${noteId}, user ${userId}`);
        // Return no permissions instead of 404
        return res.json({
          canEdit: false,
          canDelete: false,
          isShared: false
        });
      }

      console.log(`✅ Found shared note permissions: canEdit=${sharedNote.canEdit}, canDelete=${sharedNote.canDelete}, canCreate=${sharedNote.canCreate}`);
      res.json({
        canEdit: sharedNote.canEdit,
        canDelete: sharedNote.canDelete,
        canCreate: sharedNote.canCreate,
        isShared: true,
        sharedNoteId: sharedNote.id
      });
    } catch (error) {
      console.error('Error getting shared note permissions:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // Get all create permissions for current user (to show "Add Note" button)
  getCreatePermissions = async (req, res) => {
    try {
      const userId = req.user.id;

      const createPermissions = await SharedNote.findAll({
        where: {
          sharedWithUserId: userId,
          canCreate: true,
          isActive: true
        },
        include: [
          {
            model: User,
            as: 'sharedByUser',
            attributes: ['id', 'name', 'email', 'avatar']
          }
        ],
        attributes: ['id', 'sharedByUserId', 'canCreate']
      });

      res.json({
        permissions: createPermissions.map(p => ({
          id: p.id,
          sharedByUserId: p.sharedByUserId,
          sharedByUser: p.sharedByUser,
          canCreate: p.canCreate
        }))
      });
    } catch (error) {
      console.error('Error getting create permissions:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // Share a note with a group
  shareNoteToGroup = async (req, res) => {
    try {
      const { id } = req.params; // note id
      const { groupId, message, groupMessageId } = req.body;
      const sharedByUserId = req.user.id;

      // Check if note exists and belongs to the user
      const note = await Note.findOne({ 
        where: { id, userId: sharedByUserId },
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
      });

      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú hoặc bạn không có quyền chia sẻ ghi chú này' });
      }

      // Check if target group exists and user is a member
      const group = await Group.findByPk(groupId, {
        attributes: ['id', 'name', 'avatar'],
        include: [{
          model: GroupMember,
          as: 'members',
          where: { userId: sharedByUserId },
          required: true,
          attributes: []
        }]
      });

      if (!group) {
        return res.status(404).json({ message: 'Không tìm thấy nhóm hoặc bạn không phải thành viên của nhóm này' });
      }

      // Check if already shared to this group
      const existingShare = await GroupSharedNote.findOne({
        where: { noteId: id, groupId, sharedByUserId }
      });

      if (existingShare) {
        return res.status(400).json({ message: 'Ghi chú đã được chia sẻ trong nhóm này' });
      }

      // Create group shared note
      const groupSharedNote = await GroupSharedNote.create({
        noteId: id,
        groupId,
        sharedByUserId,
        message,
        groupMessageId, // Store the group message ID for deletion tracking
        isActive: true
      });

      // Get complete group shared note data for response
      const completeGroupSharedNote = await GroupSharedNote.findByPk(groupSharedNote.id, {
        include: [
          { 
            model: Note, 
            as: 'note',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
          },
          { model: Group, as: 'group', attributes: ['id', 'name', 'avatar'] },
          { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email'] }
        ]
      });

      // Emit real-time events
      emitToAllAdmins('user_group_shared_note_created', completeGroupSharedNote);

      res.status(201).json({
        message: 'Chia sẻ ghi chú vào nhóm thành công',
        groupSharedNote: completeGroupSharedNote
      });
    } catch (error) {
      console.error('Error sharing note to group:', error);
      res.status(400).json({ message: error.message });
    }
  };
}

export default NotesSharingChild;
