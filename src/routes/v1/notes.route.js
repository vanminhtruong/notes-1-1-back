import { Router } from 'express';
import * as notesController from '../../controllers/notes.controller.js';
import authMiddleware from '../../middlewares/auth.js';
import { validateCreateNote, validateUpdateNote, validateShareNote, validateShareNoteToGroup, validateCreateFolder, validateUpdateFolder, validateMoveNoteToFolder, validateCreateCategory, validateUpdateCategory, validateCreateTag, validateUpdateTag, validateAddTagToNote } from '../../validators/notes.validator.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Notes CRUD
router.post('/', validateCreateNote, notesController.createNote);
router.get('/', notesController.getNotes);
router.get('/search/autocomplete', notesController.searchAutocomplete);
router.get('/stats', notesController.getNoteStats);
router.get('/users', notesController.getUsers); // Move before /:id to avoid conflict

// Folder routes - Must be before /:id to avoid conflict
router.get('/folders', notesController.getFolders);
router.get('/folders/search/all', notesController.searchFolders);
router.post('/folders', validateCreateFolder, notesController.createFolder);
router.get('/folders/:id', notesController.getFolderById);
router.put('/folders/:id', validateUpdateFolder, notesController.updateFolder);
router.patch('/folders/:id/pin', notesController.pinFolder);
router.patch('/folders/:id/unpin', notesController.unpinFolder);
router.delete('/folders/:id', notesController.deleteFolder);

// Category routes - Must be before /:id to avoid conflict
router.get('/categories/search', notesController.searchCategories); // Search endpoint
router.get('/categories', notesController.getCategories);
router.post('/categories', validateCreateCategory, notesController.createCategory);
router.get('/categories/:id', notesController.getCategoryById);
router.put('/categories/:id', validateUpdateCategory, notesController.updateCategory);
router.delete('/categories/:id', notesController.deleteCategory);

// Tag routes - Must be before /:id to avoid conflict
router.get('/tags', notesController.getTags);
router.post('/tags', validateCreateTag, notesController.createTag);
router.get('/tags/:id', notesController.getTagById);
router.put('/tags/:id', validateUpdateTag, notesController.updateTag);
router.delete('/tags/:id', notesController.deleteTag);
router.get('/tags/:tagId/notes', notesController.getNotesByTag);
router.post('/:noteId/tags', validateAddTagToNote, notesController.addTagToNote);
router.delete('/:noteId/tags/:tagId', notesController.removeTagFromNote);

// Sharing routes - Must be before /:id to avoid conflict
router.get('/shared/with-me', notesController.getSharedWithMe);
router.get('/shared/by-me', notesController.getSharedByMe);
router.get('/shared/groups', notesController.getGroupSharedNotes);
router.get('/shared/permissions/:noteId', notesController.getSharedNotePermissions);
router.get('/shared/create-permissions', notesController.getCreatePermissions);
router.delete('/shared/:id', notesController.removeSharedNote);
router.delete('/shared/groups/:id', notesController.removeGroupSharedNote);
router.put('/shared/:id/permissions', notesController.updateSharedNotePermissions);
router.put('/shared/groups/:id/permissions', notesController.updateGroupSharedNotePermissions);

// Note by ID and operations - Must be after specific routes
router.get('/:id', notesController.getNoteById);
router.put('/:id', validateUpdateNote, notesController.updateNote);
router.patch('/:id/ack-reminder', notesController.acknowledgeReminder);
router.patch('/:id/archive', notesController.archiveNote);
router.patch('/:id/pin', notesController.pinNote);
router.patch('/:id/unpin', notesController.unpinNote);
router.delete('/:id', notesController.deleteNote);
router.post('/:id/share', validateShareNote, notesController.shareNote);
router.post('/:id/share-group', validateShareNoteToGroup, notesController.shareNoteToGroup);
router.patch('/:noteId/move-to-folder', validateMoveNoteToFolder, notesController.moveNoteToFolder);

export default router;
