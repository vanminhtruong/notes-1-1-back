import { Note, User, Group, GroupMember, NoteCategory } from '../../models/index.js';
import { noteRepository, userRepository, sharedNoteRepository, groupRepository, groupSharedNoteRepository, groupMemberRepository } from '../../repositories/index.js';
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
      const note = await noteRepository.findOne({ 
        where: { id, userId: sharedByUserId },
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }]
      });

      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú hoặc bạn không có quyền chia sẻ ghi chú này' });
      }

      // Check if already shared with this user
      const existingShare = await sharedNoteRepository.findByNoteAndUser(id, sharedWithUserId);

      if (existingShare) {
        return res.status(400).json({ message: 'Ghi chú đã được chia sẻ với người dùng này' });
      }

      const sharedNote = await sharedNoteRepository.create({
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
      const completeSharedNote = await sharedNoteRepository.findByPk(sharedNote.id, {
        include: [
          { 
            model: Note, 
            as: 'note',
            include: [
              { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
              { model: NoteCategory, as: 'category', attributes: ['id', 'name', 'color', 'icon'] }
            ]
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

      const { count, rows: sharedNotes } = await sharedNoteRepository.findAndCountAll({
        where: whereClause,
        include: [
          { 
            model: Note, 
            as: 'note', 
            where: search ? noteWhere : undefined,
            include: [
              { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
              { model: NoteCategory, as: 'category', attributes: ['id', 'name', 'color', 'icon'] }
            ]
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

      const { count, rows: sharedNotes } = await sharedNoteRepository.findAndCountAll({
        where: whereClause,
        include: [
          { 
            model: Note, 
            as: 'note', 
            where: search ? noteWhere : undefined,
            include: [
              { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
              { model: NoteCategory, as: 'category', attributes: ['id', 'name', 'color', 'icon'] }
            ]
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

      const sharedNote = await sharedNoteRepository.findByPk(id, {
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

      const users = await userRepository.findAll({
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
      const note = await noteRepository.findByPk(noteId);
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
      const allSharedNotes = await sharedNoteRepository.findAll({
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
      const sharedNote = await sharedNoteRepository.findOne({
        where: {
          noteId: noteId,
          sharedWithUserId: userId,
          isActive: true
        },
        attributes: ['id', 'canEdit', 'canDelete', 'canCreate']
      });

      if (!sharedNote) {
        console.log(`❌ No active 1-1 shared note found for note ${noteId}, user ${userId}`);
        
        // Check group shared note permissions
        const groupSharedNote = await groupSharedNoteRepository.findOne({
          where: {
            noteId: noteId,
            isActive: true
          },
          include: [{
            model: Group,
            as: 'group',
            include: [{
              model: GroupMember,
              as: 'members',
              where: { userId },
              attributes: ['id']
            }]
          }],
          attributes: ['id', 'canEdit', 'canDelete', 'canCreate']
        });

        if (!groupSharedNote) {
          console.log(`❌ No active group shared note found for note ${noteId}, user ${userId}`);
          return res.json({
            canEdit: false,
            canDelete: false,
            canCreate: false,
            isShared: false
          });
        }

        console.log(`✅ Found group shared note permissions: canEdit=${groupSharedNote.canEdit}, canDelete=${groupSharedNote.canDelete}, canCreate=${groupSharedNote.canCreate}`);
        return res.json({
          canEdit: groupSharedNote.canEdit,
          canDelete: groupSharedNote.canDelete,
          canCreate: groupSharedNote.canCreate,
          isShared: true,
          isGroupShared: true,
          groupSharedNoteId: groupSharedNote.id
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

      const createPermissions = await sharedNoteRepository.findAll({
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

  // Get group shared notes (notes shared in groups I'm a member of)
  getGroupSharedNotes = async (req, res) => {
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

      // Find all groups where user is a member
      const userGroups = await groupMemberRepository.findAll({
        where: { userId },
        attributes: ['groupId']
      });

      const groupIds = userGroups.map(gm => gm.groupId);

      if (groupIds.length === 0) {
        return res.json({
          groupSharedNotes: [],
          pagination: {
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0,
          },
        });
      }

      const whereClause = { 
        groupId: { [Op.in]: groupIds },
        isActive: true 
      };

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

      const { count, rows: groupSharedNotes } = await groupSharedNoteRepository.findAndCountAll({
        where: whereClause,
        include: [
          { 
            model: Note, 
            as: 'note',
            where: search ? noteWhere : undefined,
            include: [
              { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
              { model: NoteCategory, as: 'category', attributes: ['id', 'name', 'color', 'icon'] }
            ]
          },
          { model: Group, as: 'group', attributes: ['id', 'name', 'avatar'] },
          { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] }
        ],
        order: [[sortBy, sortOrder]],
        limit: limitNum,
        offset,
      });

      res.json({
        groupSharedNotes,
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum),
        },
      });
    } catch (error) {
      console.error('Error getting group shared notes:', error);
      res.status(400).json({ message: error.message });
    }
  };

  // Share a note with a group
  shareNoteToGroup = async (req, res) => {
    try {
      const { id } = req.params; // note id
      const { groupId, message, groupMessageId, canEdit = false, canDelete = false, canCreate = false } = req.body;
      const sharedByUserId = req.user.id;

      // Check if note exists and belongs to the user
      const note = await noteRepository.findOne({ 
        where: { id, userId: sharedByUserId },
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }]
      });

      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú hoặc bạn không có quyền chia sẻ ghi chú này' });
      }

      // Check if target group exists and user is a member, and get all members
      const group = await groupRepository.findByPk(groupId, {
        attributes: ['id', 'name', 'avatar'],
        include: [{
          model: GroupMember,
          as: 'members',
          attributes: ['userId', 'role'],
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email', 'avatar']
          }]
        }]
      });

      if (!group) {
        return res.status(404).json({ message: 'Không tìm thấy nhóm' });
      }

      // Check if user is a member
      const isMember = group.members.some(m => m.userId === sharedByUserId);
      if (!isMember) {
        return res.status(403).json({ message: 'Bạn không phải thành viên của nhóm này' });
      }

      // Check if already shared to this group
      const existingShare = await groupSharedNoteRepository.findOne({
        where: { noteId: id, groupId, sharedByUserId }
      });

      if (existingShare) {
        return res.status(400).json({ message: 'Ghi chú đã được chia sẻ trong nhóm này' });
      }

      // Create group shared note with permissions
      const groupSharedNote = await groupSharedNoteRepository.create({
        noteId: id,
        groupId,
        sharedByUserId,
        canEdit,
        canDelete,
        canCreate,
        message,
        groupMessageId, // Store the group message ID for deletion tracking
        isActive: true
      });

      // Get complete group shared note data for response
      const completeGroupSharedNote = await groupSharedNoteRepository.findByPk(groupSharedNote.id, {
        include: [
          { 
            model: Note, 
            as: 'note',
            include: [
              { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
              { model: NoteCategory, as: 'category', attributes: ['id', 'name', 'color', 'icon'] }
            ]
          },
          { model: Group, as: 'group', attributes: ['id', 'name', 'avatar'] },
          { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] }
        ]
      });

      // Emit real-time events to all group members
      console.log(`🔔 Emitting group_note_shared event to ${group.members.length} group members`);
      for (const member of group.members) {
        emitToUser(member.userId, 'group_note_shared', completeGroupSharedNote);
      }

      // Emit to admins for monitoring
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

  // Update group shared note permissions
  updateGroupSharedNotePermissions = async (req, res) => {
    try {
      const { id } = req.params; // groupSharedNoteId
      const { canEdit, canDelete, canCreate } = req.body;
      const userId = req.user.id;

      const groupSharedNote = await groupSharedNoteRepository.findByPk(id, {
        include: [
          { model: Group, as: 'group', 
            include: [{
              model: GroupMember,
              as: 'members',
              attributes: ['userId', 'role'],
              include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'name', 'email', 'avatar']
              }]
            }]
          },
          { 
            model: Note, 
            as: 'note',
            include: [
              { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
              { model: NoteCategory, as: 'category', attributes: ['id', 'name', 'color', 'icon'] }
            ]
          },
          { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] }
        ]
      });

      if (!groupSharedNote) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú chia sẻ nhóm' });
      }

      // Only the person who shared can update permissions
      if (groupSharedNote.sharedByUserId !== userId) {
        return res.status(403).json({ message: 'Chỉ người chia sẻ mới có quyền cập nhật permissions' });
      }

      // Update permissions
      await groupSharedNote.update({
        canEdit: canEdit !== undefined ? canEdit : groupSharedNote.canEdit,
        canDelete: canDelete !== undefined ? canDelete : groupSharedNote.canDelete,
        canCreate: canCreate !== undefined ? canCreate : groupSharedNote.canCreate,
      });

      // Reload with full data
      await groupSharedNote.reload();

      // Emit real-time events to all group members
      console.log(`🔔 Emitting group_note_permissions_updated event to ${groupSharedNote.group.members.length} group members`);
      for (const member of groupSharedNote.group.members) {
        emitToUser(member.userId, 'group_note_permissions_updated', groupSharedNote);
      }

      // Emit to admins for monitoring
      emitToAllAdmins('user_group_shared_note_permissions_updated', groupSharedNote);

      res.json({
        message: 'Cập nhật permissions thành công',
        groupSharedNote
      });
    } catch (error) {
      console.error('Error updating group shared note permissions:', error);
      res.status(400).json({ message: error.message });
    }
  };

  // Update individual shared note permissions
  updateSharedNotePermissions = async (req, res) => {
    try {
      const { id } = req.params; // sharedNoteId
      const { canEdit, canDelete, canCreate } = req.body;
      const userId = req.user.id;

      const sharedNote = await sharedNoteRepository.findByPk(id, {
        include: [
          { 
            model: Note, 
            as: 'note',
            include: [
              { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
              { model: NoteCategory, as: 'category', attributes: ['id', 'name', 'color', 'icon'] }
            ]
          },
          { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] },
          { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email', 'avatar'] }
        ]
      });

      if (!sharedNote) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú chia sẻ' });
      }

      // Only the person who shared can update permissions
      if (sharedNote.sharedByUserId !== userId) {
        return res.status(403).json({ message: 'Chỉ người chia sẻ mới có quyền cập nhật permissions' });
      }

      // Update permissions
      await sharedNote.update({
        canEdit: canEdit !== undefined ? canEdit : sharedNote.canEdit,
        canDelete: canDelete !== undefined ? canDelete : sharedNote.canDelete,
        canCreate: canCreate !== undefined ? canCreate : sharedNote.canCreate,
      });

      // Reload with full data
      await sharedNote.reload();

      // Emit real-time events to both users
      console.log(`🔔 Emitting shared_note_permissions_updated event to users`);
      emitToUser(sharedNote.sharedByUserId, 'shared_note_permissions_updated', sharedNote);
      emitToUser(sharedNote.sharedWithUserId, 'shared_note_permissions_updated', sharedNote);

      // Emit to admins for monitoring
      emitToAllAdmins('user_shared_note_permissions_updated', sharedNote);

      res.json({
        message: 'Cập nhật permissions thành công',
        sharedNote
      });
    } catch (error) {
      console.error('Error updating shared note permissions:', error);
      res.status(400).json({ message: error.message });
    }
  };

  // Remove/delete group shared note (only owner can delete)
  removeGroupSharedNote = async (req, res) => {
    try {
      const { id } = req.params; // groupSharedNoteId
      const userId = req.user.id;

      const groupSharedNote = await groupSharedNoteRepository.findByPk(id, {
        include: [
          { 
            model: Group, 
            as: 'group',
            include: [{
              model: GroupMember,
              as: 'members',
              attributes: ['userId'],
            }]
          },
          { model: Note, as: 'note' },
          { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email'] }
        ]
      });

      if (!groupSharedNote) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú chia sẻ nhóm' });
      }

      // Only the person who shared can delete
      if (groupSharedNote.sharedByUserId !== userId) {
        return res.status(403).json({ message: 'Chỉ người chia sẻ mới có quyền xóa' });
      }

      // Delete the group shared note
      await groupSharedNote.destroy();

      // Emit real-time events to all group members
      console.log(`🔔 Emitting group_note_removed event to ${groupSharedNote.group.members.length} group members`);
      for (const member of groupSharedNote.group.members) {
        emitToUser(member.userId, 'group_note_removed', { id: groupSharedNote.id });
      }

      // Emit to admins for monitoring
      emitToAllAdmins('user_group_shared_note_removed', { id: groupSharedNote.id });

      res.json({
        message: 'Đã xóa ghi chú chia sẻ nhóm thành công'
      });
    } catch (error) {
      console.error('Error removing group shared note:', error);
      res.status(400).json({ message: error.message });
    }
  };
}

export default NotesSharingChild;
