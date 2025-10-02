import express from 'express';
import authenticate from '../../middlewares/auth.js';
import { getE2EE, updateE2EE, getE2EEPin, updateE2EEPin, getReadStatus, updateReadStatus, getTheme, updateTheme, getLanguage, updateLanguage, getPrivacy, updatePrivacy } from '../../controllers/settings.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/e2ee', getE2EE);
router.put('/e2ee', updateE2EE);
router.get('/e2ee/pin', getE2EEPin);
router.put('/e2ee/pin', updateE2EEPin);
router.get('/read-status', getReadStatus);
router.put('/read-status', updateReadStatus);
router.get('/theme', getTheme);
router.put('/theme', updateTheme);
router.get('/language', getLanguage);
router.put('/language', updateLanguage);
router.get('/privacy', getPrivacy);
router.put('/privacy', updatePrivacy);

export default router;
