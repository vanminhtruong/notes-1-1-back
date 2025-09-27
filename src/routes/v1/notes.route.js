const router = require('express').Router();
const notesController = require('../../controllers/notes.controller');
const authMiddleware = require('../../middlewares/auth');
const { validateCreateNote, validateUpdateNote, validateShareNote, validateShareNoteToGroup } = require('../../validators/notes.validator');

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
router.delete('/shared/:id', notesController.removeSharedNote);

module.exports = router;
