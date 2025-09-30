const AuthCoreChild = require('./group-child/auth.core.child');
const AuthOAuthChild = require('./group-child/auth.oauth.child');
const AuthProfileChild = require('./group-child/auth.profile.child');
const AuthPasswordResetChild = require('./group-child/auth.password-reset.child');

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

module.exports = new AuthController();
