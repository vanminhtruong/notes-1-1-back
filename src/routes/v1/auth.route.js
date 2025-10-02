import { Router } from 'express';
import * as authController from '../../controllers/auth.controller.js';
import authMiddleware from '../../middlewares/auth.js';
import { 
  validateRegister, 
  validateLogin, 
  validateChangePassword,
  validateForgotPasswordRequest,
  validateVerifyOtp,
  validateResetPassword,
  validateUpdateProfile,
  validateRememberPref,
} from '../../validators/auth.validator.js';

const router = Router();

// Public routes   
router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/google', authController.googleLogin);
router.post('/facebook', authController.facebookLogin);
router.post('/forgot-password', validateForgotPasswordRequest, authController.forgotPasswordRequest);
router.post('/verify-otp', validateVerifyOtp, authController.verifyOtp);
router.post('/reset-password', validateResetPassword, authController.resetPassword);
router.post('/remember-pref', validateRememberPref, authController.getRememberPreference);

// Protected routes
router.use(authMiddleware);
router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);
router.put('/profile', validateUpdateProfile, authController.updateProfile);
router.put('/change-password', validateChangePassword, authController.changePassword);
router.delete('/account', authController.deleteAccount);

export default router;
