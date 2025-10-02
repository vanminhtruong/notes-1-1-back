import { Router } from 'express';
import * as notesController from '../../controllers/notes.controller.js';
import authMiddleware from '../../middlewares/auth.js';
import { validateCreateNote, validateUpdateNote, validateShareNote, validateShareNoteToGroup } from '../../validators/notes.validator.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Notes CRUD
router.post('/', validateCreateNote, notesController.createNote);
router.get('/', notesController.getNotes);
router.get('/stats', notesController.getNoteStats);
router.get('/users', notesController.getUsers); // Move before /:id to avoid conflict
router.get('/:id', notesController.getNoteById);
router.put('/:id', validateUpdateNote, notesController.updateNote);
router.patch('/:id/ack-reminder', notesController.acknowledgeReminder);
router.patch('/:id/archive', notesController.archiveNote);
router.delete('/:id', notesController.deleteNote);

// Sharing routes
router.post('/:id/share', validateShareNote, notesController.shareNote);
router.post('/:id/share-group', validateShareNoteToGroup, notesController.shareNoteToGroup);
router.get('/shared/with-me', notesController.getSharedWithMe);
router.get('/shared/by-me', notesController.getSharedByMe);
router.get('/shared/permissions/:noteId', notesController.getSharedNotePermissions);
router.get('/shared/create-permissions', notesController.getCreatePermissions);
router.delete('/shared/:id', notesController.removeSharedNote);

export default router;
