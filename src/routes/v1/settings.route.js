import express from 'express';
import authenticate from '../../middlewares/auth.js';
import { getReadStatus, updateReadStatus, getTheme, updateTheme, getLanguage, updateLanguage, getPrivacy, updatePrivacy, getAnimatedBackground, updateAnimatedBackground, getBackgroundColors, getBackgroundImages } from '../../controllers/settings.controller.js';

const router = express.Router();

router.use(authenticate);





router.get('/read-status', getReadStatus);
router.put('/read-status', updateReadStatus);
router.get('/theme', getTheme);
router.put('/theme', updateTheme);
router.get('/language', getLanguage);
router.put('/language', updateLanguage);
router.get('/privacy', getPrivacy);
router.put('/privacy', updatePrivacy);
router.get('/animated-background', getAnimatedBackground);
router.put('/animated-background', updateAnimatedBackground);
router.get('/background/colors', getBackgroundColors);
router.get('/background/images', getBackgroundImages);

export default router;
