const router = require('express').Router();
const notesController = require('../../controllers/notes.controller');
const authMiddleware = require('../../middlewares/auth');
const { validateCreateNote, validateUpdateNote } = require('../../validators/notes.validator');

// All routes require authentication
router.use(authMiddleware);

// Notes CRUD
router.post('/', validateCreateNote, notesController.createNote);
router.get('/', notesController.getNotes);
router.get('/stats', notesController.getNoteStats);
router.get('/:id', notesController.getNoteById);
router.put('/:id', validateUpdateNote, notesController.updateNote);
router.patch('/:id/archive', notesController.archiveNote);
router.delete('/:id', notesController.deleteNote);

module.exports = router;
