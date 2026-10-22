// Barrel export cho tầng Repository.
// Service chỉ nên import từ đây thay vì gọi trực tiếp Sequelize model.
import userRepository from './user.repository.js';
import noteRepository from './note.repository.js';
import noteFolderRepository from './noteFolder.repository.js';
import noteCategoryRepository from './noteCategory.repository.js';
import noteTagRepository from './noteTag.repository.js';
import noteTagMappingRepository from './noteTagMapping.repository.js';
import backgroundRepository from './background.repository.js';
import friendshipRepository from './friendship.repository.js';
import messageRepository from './message.repository.js';
import passwordResetRepository from './passwordReset.repository.js';
import groupRepository from './group.repository.js';
import groupMemberRepository from './groupMember.repository.js';
import groupMessageRepository from './groupMessage.repository.js';
import groupInviteRepository from './groupInvite.repository.js';
import messageReadRepository from './messageRead.repository.js';
import groupMessageReadRepository from './groupMessageRead.repository.js';
import chatPreferenceRepository from './chatPreference.repository.js';
import blockedUserRepository from './blockedUser.repository.js';
import pinnedChatRepository from './pinnedChat.repository.js';
import pinnedMessageRepository from './pinnedMessage.repository.js';
import messageReactionRepository from './messageReaction.repository.js';
import notificationRepository from './notification.repository.js';
import sharedNoteRepository from './sharedNote.repository.js';
import groupSharedNoteRepository from './groupSharedNote.repository.js';
import userSessionRepository from './userSession.repository.js';

export {
  userRepository,
  noteRepository,
  noteFolderRepository,
  noteCategoryRepository,
  noteTagRepository,
  noteTagMappingRepository,
  backgroundRepository,
  friendshipRepository,
  messageRepository,
  passwordResetRepository,
  groupRepository,
  groupMemberRepository,
  groupMessageRepository,
  groupInviteRepository,
  messageReadRepository,
  groupMessageReadRepository,
  chatPreferenceRepository,
  blockedUserRepository,
  pinnedChatRepository,
  pinnedMessageRepository,
  messageReactionRepository,
  notificationRepository,
  sharedNoteRepository,
  groupSharedNoteRepository,
  userSessionRepository,
};
