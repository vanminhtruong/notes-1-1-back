import SettingsE2EEChild from '../service/settings-service/settings.e2ee.service.js';
import SettingsAppearanceChild from '../service/settings-service/settings.appearance.service.js';
import SettingsPrivacyChild from '../service/settings-service/settings.privacy.service.js';
import SettingsReadStatusChild from '../service/settings-service/settings.readstatus.service.js';

// OOP-style controller similar to GroupController
class SettingsController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.e2eeChild = new SettingsE2EEChild(this);
    this.appearanceChild = new SettingsAppearanceChild(this);
    this.privacyChild = new SettingsPrivacyChild(this);
    this.readStatusChild = new SettingsReadStatusChild(this);
  }

  // Delegate methods to child services
  getE2EE = (...args) => this.e2eeChild.getE2EE(...args);
  updateE2EE = (...args) => this.e2eeChild.updateE2EE(...args);
  getE2EEPin = (...args) => this.e2eeChild.getE2EEPin(...args);
  updateE2EEPin = (...args) => this.e2eeChild.updateE2EEPin(...args);
  getReadStatus = (...args) => this.readStatusChild.getReadStatus(...args);
  updateReadStatus = (...args) => this.readStatusChild.updateReadStatus(...args);
  getTheme = (...args) => this.appearanceChild.getTheme(...args);
  updateTheme = (...args) => this.appearanceChild.updateTheme(...args);
  getLanguage = (...args) => this.appearanceChild.getLanguage(...args);
  updateLanguage = (...args) => this.appearanceChild.updateLanguage(...args);
  getPrivacy = (...args) => this.privacyChild.getPrivacy(...args);
  updatePrivacy = (...args) => this.privacyChild.updatePrivacy(...args);
}

const settingsController = new SettingsController();

export { SettingsController };

export const getE2EE = settingsController.getE2EE;
export const updateE2EE = settingsController.updateE2EE;
export const getE2EEPin = settingsController.getE2EEPin;
export const updateE2EEPin = settingsController.updateE2EEPin;
export const getReadStatus = settingsController.getReadStatus;
export const updateReadStatus = settingsController.updateReadStatus;
export const getTheme = settingsController.getTheme;
export const updateTheme = settingsController.updateTheme;
export const getLanguage = settingsController.getLanguage;
export const updateLanguage = settingsController.updateLanguage;
export const getPrivacy = settingsController.getPrivacy;
export const updatePrivacy = settingsController.updatePrivacy;
