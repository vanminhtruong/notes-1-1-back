import AuthCoreChild from './group-child/auth.core.child.js';
import AuthOAuthChild from './group-child/auth.oauth.child.js';
import AuthProfileChild from './group-child/auth.profile.child.js';
import AuthPasswordResetChild from './group-child/auth.password-reset.child.js';

class AuthController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.coreChild = new AuthCoreChild(this);
    this.oauthChild = new AuthOAuthChild(this);
    this.profileChild = new AuthProfileChild(this);
    this.passwordResetChild = new AuthPasswordResetChild(this);
  }

  // Delegated methods to child controllers - Core Auth
  register = (...args) => this.coreChild.register(...args);
  login = (...args) => this.coreChild.login(...args);
  logout = (...args) => this.coreChild.logout(...args);
  getRememberPreference = (...args) => this.coreChild.getRememberPreference(...args);
  deleteAccount = (...args) => this.coreChild.deleteAccount(...args);

  // Delegated methods - OAuth
  googleLogin = (...args) => this.oauthChild.googleLogin(...args);
  facebookLogin = (...args) => this.oauthChild.facebookLogin(...args);

  // Delegated methods - Profile
  getProfile = (...args) => this.profileChild.getProfile(...args);
  updateProfile = (...args) => this.profileChild.updateProfile(...args);
  changePassword = (...args) => this.profileChild.changePassword(...args);

  // Delegated methods - Password Reset
  forgotPasswordRequest = (...args) => this.passwordResetChild.forgotPasswordRequest(...args);
  verifyOtp = (...args) => this.passwordResetChild.verifyOtp(...args);
  resetPassword = (...args) => this.passwordResetChild.resetPassword(...args);
}

const authController = new AuthController();

export default authController;

// Export individual methods for routes
export const register = authController.register;
export const login = authController.login;
export const logout = authController.logout;
export const getRememberPreference = authController.getRememberPreference;
export const deleteAccount = authController.deleteAccount;
export const googleLogin = authController.googleLogin;
export const facebookLogin = authController.facebookLogin;
export const getProfile = authController.getProfile;
export const updateProfile = authController.updateProfile;
export const changePassword = authController.changePassword;
export const forgotPasswordRequest = authController.forgotPasswordRequest;
export const verifyOtp = authController.verifyOtp;
export const resetPassword = authController.resetPassword;
