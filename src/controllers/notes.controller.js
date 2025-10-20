import NotesBasicChild from '../service/notes-service/notes.basic.service.js';
import NotesSharingChild from '../service/notes-service/notes.sharing.service.js';
import NotesStatsChild from '../service/notes-service/notes.stats.service.js';
import NotesFoldersChild from '../service/notes-service/notes.folders.service.js';
import NotesCategoriesChild from '../service/notes-service/notes.categories.service.js';
import NotesTagsChild from '../service/notes-service/notes.tags.service.js';

class NotesController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.basicChild = new NotesBasicChild(this);
    this.sharingChild = new NotesSharingChild(this);
    this.statsChild = new NotesStatsChild(this);
    this.foldersChild = new NotesFoldersChild(this);
    this.categoriesChild = new NotesCategoriesChild(this);
    this.tagsChild = new NotesTagsChild(this);
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
  pinNote = (...args) => this.basicChild.pinNote(...args);
  unpinNote = (...args) => this.basicChild.unpinNote(...args);
  
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
  getGroupSharedNotes = (...args) => this.sharingChild.getGroupSharedNotes(...args);
  updateSharedNotePermissions = (...args) => this.sharingChild.updateSharedNotePermissions(...args);
  updateGroupSharedNotePermissions = (...args) => this.sharingChild.updateGroupSharedNotePermissions(...args);
  removeGroupSharedNote = (...args) => this.sharingChild.removeGroupSharedNote(...args);
  
  // Folder operations - delegate to foldersChild
  getFolders = (...args) => this.foldersChild.getFolders(...args);
  getFolderById = (...args) => this.foldersChild.getFolderById(...args);
  createFolder = (...args) => this.foldersChild.createFolder(...args);
  updateFolder = (...args) => this.foldersChild.updateFolder(...args);
  deleteFolder = (...args) => this.foldersChild.deleteFolder(...args);
  searchFolders = (...args) => this.foldersChild.searchFolders(...args);
  moveNoteToFolder = (...args) => this.foldersChild.moveNoteToFolder(...args);
  pinFolder = (...args) => this.foldersChild.pinFolder(...args);
  unpinFolder = (...args) => this.foldersChild.unpinFolder(...args);
  
  // Category operations - delegate to categoriesChild
  getCategories = (...args) => this.categoriesChild.getCategories(...args);
  searchCategories = (...args) => this.categoriesChild.searchCategories(...args);
  getCategoryById = (...args) => this.categoriesChild.getCategoryById(...args);
  createCategory = (...args) => this.categoriesChild.createCategory(...args);
  updateCategory = (...args) => this.categoriesChild.updateCategory(...args);
  deleteCategory = (...args) => this.categoriesChild.deleteCategory(...args);
  
  // Tag operations - delegate to tagsChild
  getTags = (...args) => this.tagsChild.getTags(...args);
  getTagById = (...args) => this.tagsChild.getTagById(...args);
  createTag = (...args) => this.tagsChild.createTag(...args);
  updateTag = (...args) => this.tagsChild.updateTag(...args);
  deleteTag = (...args) => this.tagsChild.deleteTag(...args);
  addTagToNote = (...args) => this.tagsChild.addTagToNote(...args);
  removeTagFromNote = (...args) => this.tagsChild.removeTagFromNote(...args);
  getNotesByTag = (...args) => this.tagsChild.getNotesByTag(...args);
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
export const getGroupSharedNotes = notesController.getGroupSharedNotes;
export const updateSharedNotePermissions = notesController.updateSharedNotePermissions;
export const updateGroupSharedNotePermissions = notesController.updateGroupSharedNotePermissions;
export const removeGroupSharedNote = notesController.removeGroupSharedNote;
export const getFolders = notesController.getFolders;
export const getFolderById = notesController.getFolderById;
export const createFolder = notesController.createFolder;
export const updateFolder = notesController.updateFolder;
export const deleteFolder = notesController.deleteFolder;
export const searchFolders = notesController.searchFolders;
export const moveNoteToFolder = notesController.moveNoteToFolder;
export const pinFolder = notesController.pinFolder;
export const unpinFolder = notesController.unpinFolder;
export const pinNote = notesController.pinNote;
export const unpinNote = notesController.unpinNote;
export const getCategories = notesController.getCategories;
export const searchCategories = notesController.searchCategories;
export const getCategoryById = notesController.getCategoryById;
export const createCategory = notesController.createCategory;
export const updateCategory = notesController.updateCategory;
export const deleteCategory = notesController.deleteCategory;
export const getTags = notesController.getTags;
export const getTagById = notesController.getTagById;
export const createTag = notesController.createTag;
export const updateTag = notesController.updateTag;
export const deleteTag = notesController.deleteTag;
export const addTagToNote = notesController.addTagToNote;
export const removeTagFromNote = notesController.removeTagFromNote;
export const getNotesByTag = notesController.getNotesByTag;
