import NotesBasicChild from '../service/notes-service/notes.basic.service.js';
import NotesSharingChild from '../service/notes-service/notes.sharing.service.js';
import NotesStatsChild from '../service/notes-service/notes.stats.service.js';
import NotesFoldersChild from '../service/notes-service/notes.folders.service.js';

class NotesController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.basicChild = new NotesBasicChild(this);
    this.sharingChild = new NotesSharingChild(this);
    this.statsChild = new NotesStatsChild(this);
    this.foldersChild = new NotesFoldersChild(this);
  }

  // Basic CRUD operations - delegate to basicChild
  createNote = (...args) => this.basicChild.createNote(...args);
  acknowledgeReminder = (...args) => this.basicChild.acknowledgeReminder(...args);
  getNotes = (...args) => this.basicChild.getNotes(...args);
  searchAutocomplete = (...args) => this.basicChild.searchAutocomplete(...args);
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
  
  // Folder operations - delegate to foldersChild
  getFolders = (...args) => this.foldersChild.getFolders(...args);
  getFolderById = (...args) => this.foldersChild.getFolderById(...args);
  createFolder = (...args) => this.foldersChild.createFolder(...args);
  updateFolder = (...args) => this.foldersChild.updateFolder(...args);
  deleteFolder = (...args) => this.foldersChild.deleteFolder(...args);
  moveNoteToFolder = (...args) => this.foldersChild.moveNoteToFolder(...args);
}

const notesController = new NotesController();

export { NotesController };

export const createNote = notesController.createNote;
export const getNotes = notesController.getNotes;
export const searchAutocomplete = notesController.searchAutocomplete;
export const getNoteById = notesController.getNoteById;
export const updateNote = notesController.updateNote;
export const deleteNote = notesController.deleteNote;
export const archiveNote = notesController.archiveNote;
export const getNoteStats = notesController.getNoteStats;
export const acknowledgeReminder = notesController.acknowledgeReminder;
export const shareNote = notesController.shareNote;
export const getSharedWithMe = notesController.getSharedWithMe;
export const getSharedByMe = notesController.getSharedByMe;
export const removeSharedNote = notesController.removeSharedNote;
export const getUsers = notesController.getUsers;
export const getSharedNotePermissions = notesController.getSharedNotePermissions;
export const getCreatePermissions = notesController.getCreatePermissions;
export const shareNoteToGroup = notesController.shareNoteToGroup;
export const getFolders = notesController.getFolders;
export const getFolderById = notesController.getFolderById;
export const createFolder = notesController.createFolder;
export const updateFolder = notesController.updateFolder;
export const deleteFolder = notesController.deleteFolder;
export const moveNoteToFolder = notesController.moveNoteToFolder;
