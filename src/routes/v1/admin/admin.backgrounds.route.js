import express from 'express';
import adminBackgroundsController from '../../../controllers/admin/admin.backgrounds.controller.js';
import { validateCreateBackground, validateUpdateBackground } from '../../../validators/admin.backgrounds.validator.js';
import { requirePermission } from '../../../middlewares/adminAuth.middleware.js';

const router = express.Router();

// ============ Colors Routes ============
// GET /api/v1/admin/backgrounds/colors
router.get(
  '/colors',
  requirePermission('manage_notes.backgrounds.view'),
  adminBackgroundsController.getColors
);

// POST /api/v1/admin/backgrounds/colors
router.post(
  '/colors',
  requirePermission('manage_notes.backgrounds.create'),
  validateCreateBackground,
  adminBackgroundsController.createColor
);

// ============ Images Routes ============
// GET /api/v1/admin/backgrounds/images
router.get(
  '/images',
  requirePermission('manage_notes.backgrounds.view'),
  adminBackgroundsController.getImages
);

// POST /api/v1/admin/backgrounds/images
router.post(
  '/images',
  requirePermission('manage_notes.backgrounds.create'),
  validateCreateBackground,
  adminBackgroundsController.createImage
);

// ============ Common Routes (by ID) ============
// GET /api/v1/admin/backgrounds/:id
router.get(
  '/:id',
  requirePermission('manage_notes.backgrounds.view'),
  adminBackgroundsController.getBackgroundById
);

// PUT /api/v1/admin/backgrounds/:id
router.put(
  '/:id',
  requirePermission('manage_notes.backgrounds.edit'),
  validateUpdateBackground,
  adminBackgroundsController.updateBackground
);

// DELETE /api/v1/admin/backgrounds/:id
router.delete(
  '/:id',
  requirePermission('manage_notes.backgrounds.delete'),
  adminBackgroundsController.deleteBackground
);

// PATCH /api/v1/admin/backgrounds/:id/toggle-active
router.patch(
  '/:id/toggle-active',
  requirePermission('manage_notes.backgrounds.edit'),
  adminBackgroundsController.toggleActive
);

export default router;
