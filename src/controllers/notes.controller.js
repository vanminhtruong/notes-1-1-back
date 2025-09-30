const NotesBasicChild = require('./notes-child/notes.basic.child');
const NotesSharingChild = require('./notes-child/notes.sharing.child');
const NotesStatsChild = require('./notes-child/notes.stats.child');

class NotesController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.basicChild = new NotesBasicChild(this);
    this.sharingChild = new NotesSharingChild(this);
    this.statsChild = new NotesStatsChild(this);
  }

  // Basic CRUD operations - delegate to basicChild
  createNote = (...args) => this.basicChild.createNote(...args);
  acknowledgeReminder = (...args) => this.basicChild.acknowledgeReminder(...args);
  getNotes = (...args) => this.basicChild.getNotes(...args);
  getNoteById = (...args) => this.basicChild.getNoteById(...args);
  updateNote = (...args) => this.basicChild.updateNote(...args);
  deleteNote = (...args) => this.basicChild.deleteNote(...args);
  archiveNote = (...args) => this.basicChild.archiveNote(...args);
  
  // Stats operations - delegate to statsChild
  getNoteStats = (...args) => this.statsChild.getNoteStats(...args);
  
  // Sharing operations - delegate to sharingChild
  shareNote = (...args) => this.sharingChild.shareNote(...args);
  getSharedWithMe = (...args) => this.sharingChild.getSharedWithMe(...args);
  getSharedByMe = (...args) => this.sharingChild.getSharedByMe(...args);
  removeSharedNote = (...args) => this.sharingChild.removeSharedNote(...args);
  getUsers = (...args) => this.sharingChild.getUsers(...args);
  getSharedNotePermissions = (...args) => this.sharingChild.getSharedNotePermissions(...args);
  getCreatePermissions = (...args) => this.sharingChild.getCreatePermissions(...args);
  shareNoteToGroup = (...args) => this.sharingChild.shareNoteToGroup(...args);
}

const notesController = new NotesController();

module.exports = {
  NotesController,
  // Export bound instance methods so external code uses class-based handlers
  createNote: notesController.createNote,
  getNotes: notesController.getNotes,
  getNoteById: notesController.getNoteById,
  updateNote: notesController.updateNote,
  deleteNote: notesController.deleteNote,
  archiveNote: notesController.archiveNote,
  getNoteStats: notesController.getNoteStats,
  acknowledgeReminder: notesController.acknowledgeReminder,
  shareNote: notesController.shareNote,
  getSharedWithMe: notesController.getSharedWithMe,
  getSharedByMe: notesController.getSharedByMe,
  removeSharedNote: notesController.removeSharedNote,
  getUsers: notesController.getUsers,
  getSharedNotePermissions: notesController.getSharedNotePermissions,
  getCreatePermissions: notesController.getCreatePermissions,
  shareNoteToGroup: notesController.shareNoteToGroup,
};
