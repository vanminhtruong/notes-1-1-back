
import SettingsAppearanceChild from '../service/settings-service/settings.appearance.service.js';
import SettingsPrivacyChild from '../service/settings-service/settings.privacy.service.js';
import SettingsReadStatusChild from '../service/settings-service/settings.readstatus.service.js';
import SettingsAnimatedBackgroundChild from '../service/settings-service/settings.animatedbackground.service.js';
import SettingsBackgroundChild from '../service/settings-service/settings.background.service.js';

// OOP-style controller similar to GroupController
class SettingsController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface

    this.appearanceChild = new SettingsAppearanceChild(this);
    this.privacyChild = new SettingsPrivacyChild(this);
    this.readStatusChild = new SettingsReadStatusChild(this);
    this.animatedBackgroundChild = new SettingsAnimatedBackgroundChild(this);
    this.backgroundChild = new SettingsBackgroundChild(this);
  }

  // Delegate methods to child services




  getReadStatus = (...args) => this.readStatusChild.getReadStatus(...args);
  updateReadStatus = (...args) => this.readStatusChild.updateReadStatus(...args);
  getTheme = (...args) => this.appearanceChild.getTheme(...args);
  updateTheme = (...args) => this.appearanceChild.updateTheme(...args);
  getLanguage = (...args) => this.appearanceChild.getLanguage(...args);
  updateLanguage = (...args) => this.appearanceChild.updateLanguage(...args);
  getPrivacy = (...args) => this.privacyChild.getPrivacy(...args);
  updatePrivacy = (...args) => this.privacyChild.updatePrivacy(...args);
  getAnimatedBackground = (...args) => this.animatedBackgroundChild.getAnimatedBackground(...args);
  updateAnimatedBackground = (...args) => this.animatedBackgroundChild.updateAnimatedBackground(...args);
  getBackgroundColors = (...args) => this.backgroundChild.getBackgroundColors(...args);
  getBackgroundImages = (...args) => this.backgroundChild.getBackgroundImages(...args);
}

const settingsController = new SettingsController();

export { SettingsController };





export const getReadStatus = settingsController.getReadStatus;
export const updateReadStatus = settingsController.updateReadStatus;
export const getTheme = settingsController.getTheme;
export const updateTheme = settingsController.updateTheme;
export const getLanguage = settingsController.getLanguage;
export const updateLanguage = settingsController.updateLanguage;
export const getPrivacy = settingsController.getPrivacy;
export const updatePrivacy = settingsController.updatePrivacy;
export const getAnimatedBackground = settingsController.getAnimatedBackground;
export const updateAnimatedBackground = settingsController.updateAnimatedBackground;
export const getBackgroundColors = settingsController.getBackgroundColors;
export const getBackgroundImages = settingsController.getBackgroundImages;
