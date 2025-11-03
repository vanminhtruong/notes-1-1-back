import AdminBackgroundsService from '../../service/admin-service/admin.backgrounds.service.js';

const service = new AdminBackgroundsService();

class AdminBackgroundsController {
  // GET /api/v1/admin/backgrounds/colors
  getColors = service.getColors;

  // POST /api/v1/admin/backgrounds/colors
  createColor = service.createColor;

  // GET /api/v1/admin/backgrounds/images
  getImages = service.getImages;

  // POST /api/v1/admin/backgrounds/images
  createImage = service.createImage;

  // GET /api/v1/admin/backgrounds/:id
  getBackgroundById = service.getBackgroundById;

  // PUT /api/v1/admin/backgrounds/:id
  updateBackground = service.updateBackground;

  // DELETE /api/v1/admin/backgrounds/:id
  deleteBackground = service.deleteBackground;

  // PATCH /api/v1/admin/backgrounds/:id/toggle-active
  toggleActive = service.toggleActive;
}

export default new AdminBackgroundsController();
