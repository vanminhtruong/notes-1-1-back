const { User } = require('../models');

// OOP-style controller similar to GroupController
class SettingsController {
  constructor() {}

  // GET /api/v1/settings/e2ee
  getE2EE = async (req, res) => {
    const user = req.user;
    return res.json({ enabled: !!user.e2eeEnabled });
  };

  // PUT /api/v1/settings/e2ee { enabled: boolean }
  updateE2EE = async (req, res) => {
    const user = req.user;
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'Invalid payload: enabled must be boolean' });
    }
    user.e2eeEnabled = enabled;
    await user.save();

    // Broadcast to all other devices of this user via socket
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${user.id}`).emit('e2ee_status', { enabled });
      }
    } catch (e) {
      // ignore broadcast errors
    }

    return res.json({ message: 'Updated', enabled: !!user.e2eeEnabled });
  };

  // GET /api/v1/settings/e2ee/pin
  getE2EEPin = async (req, res) => {
    const user = req.user;
    return res.json({ pinHash: user.e2eePinHash || null });
  };

  // PUT /api/v1/settings/e2ee/pin { pinHash: string|null, oldPinHash?: string }
  updateE2EEPin = async (req, res) => {
    const user = req.user;
    const { pinHash, oldPinHash } = req.body || {};
    if (pinHash != null && typeof pinHash !== 'string') {
      return res.status(400).json({ message: 'Invalid payload: pinHash must be string or null' });
    }
    if (oldPinHash != null && typeof oldPinHash !== 'string') {
      return res.status(400).json({ message: 'Invalid payload: oldPinHash must be string if provided' });
    }

    const hadExisting = !!user.e2eePinHash;
    if (hadExisting) {
      if (!oldPinHash) {
        return res.status(400).json({ message: 'Old PIN is required to change PIN' });
      }
      if (oldPinHash !== user.e2eePinHash) {
        return res.status(403).json({ message: 'Old PIN is incorrect' });
      }
    }

    user.e2eePinHash = pinHash || null;
    await user.save();

    // Broadcast PIN update to user's devices
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${user.id}`).emit('e2ee_pin_updated', { pinHash: user.e2eePinHash });
      }
    } catch (e) {}

    return res.json({ message: 'Updated', pinHash: user.e2eePinHash || null });
  };

  // GET /api/v1/settings/read-status
  getReadStatus = async (req, res) => {
    const user = req.user;
    return res.json({ enabled: !!user.readStatusEnabled });
  };

  // PUT /api/v1/settings/read-status { enabled: boolean }
  updateReadStatus = async (req, res) => {
    const user = req.user;
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'Invalid payload: enabled must be boolean' });
    }
    user.readStatusEnabled = enabled;
    await user.save();

    // Broadcast to all other devices of this user via socket
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${user.id}`).emit('read_status_updated', { enabled });
      }
    } catch (e) {
      // ignore broadcast errors
    }

    return res.json({ message: 'Updated', enabled: !!user.readStatusEnabled });
  };

  // GET /api/v1/settings/theme
  getTheme = async (req, res) => {
    const user = req.user;
    const mode = user.theme === 'dark' ? 'dark' : 'light';
    try {
      res.cookie('theme', mode, {
        httpOnly: false,
        sameSite: 'lax',
        secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    } catch (e) {}
    return res.json({ mode });
  };

  // PUT /api/v1/settings/theme { mode: 'light' | 'dark' }
  updateTheme = async (req, res) => {
    const user = req.user;
    const { mode } = req.body || {};
    if (mode !== 'light' && mode !== 'dark') {
      return res.status(400).json({ message: "Invalid payload: mode must be 'light' or 'dark'" });
    }
    user.theme = mode;
    await user.save();
    try {
      res.cookie('theme', mode, {
        httpOnly: false,
        sameSite: 'lax',
        secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    } catch (e) {}
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${user.id}`).emit('theme_updated', { mode });
      }
    } catch (e) {}
    return res.json({ message: 'Updated', mode });
  };

  // GET /api/v1/settings/language
  getLanguage = async (req, res) => {
    const user = req.user;
    const language = user.language || 'vi';
    try {
      res.cookie('lang', language, {
        httpOnly: false,
        sameSite: 'lax',
        secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    } catch (e) {}
    return res.json({ language });
  };

  // PUT /api/v1/settings/language { language: string }
  updateLanguage = async (req, res) => {
    const user = req.user;
    const { language } = req.body || {};
    if (typeof language !== 'string' || !language.trim()) {
      return res.status(400).json({ message: 'Invalid payload: language must be a non-empty string' });
    }
    user.language = language.trim();
    await user.save();
    try {
      res.cookie('lang', user.language, {
        httpOnly: false,
        sameSite: 'lax',
        secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    } catch (e) {}
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${user.id}`).emit('language_updated', { language: user.language });
      }
    } catch (e) {}
    return res.json({ message: 'Updated', language: user.language });
  };

  // GET /api/v1/settings/privacy
  getPrivacy = async (req, res) => {
    const user = req.user;
    return res.json({ hidePhone: !!user.hidePhone, hideBirthDate: !!user.hideBirthDate, allowMessagesFromNonFriends: !!user.allowMessagesFromNonFriends });
  };

  // PUT /api/v1/settings/privacy { hidePhone?: boolean, hideBirthDate?: boolean, allowMessagesFromNonFriends?: boolean }
  updatePrivacy = async (req, res) => {
    const user = req.user;
    const { hidePhone, hideBirthDate, allowMessagesFromNonFriends } = req.body || {};
    if (hidePhone != null && typeof hidePhone !== 'boolean') {
      return res.status(400).json({ message: 'Invalid payload: hidePhone must be boolean if provided' });
    }
    if (hideBirthDate != null && typeof hideBirthDate !== 'boolean') {
      return res.status(400).json({ message: 'Invalid payload: hideBirthDate must be boolean if provided' });
    }
    if (allowMessagesFromNonFriends != null && typeof allowMessagesFromNonFriends !== 'boolean') {
      return res.status(400).json({ message: 'Invalid payload: allowMessagesFromNonFriends must be boolean if provided' });
    }
    if (typeof hidePhone === 'boolean') user.hidePhone = hidePhone;
    if (typeof hideBirthDate === 'boolean') user.hideBirthDate = hideBirthDate;
    if (typeof allowMessagesFromNonFriends === 'boolean') user.allowMessagesFromNonFriends = allowMessagesFromNonFriends;
    await user.save();
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${user.id}`).emit('privacy_updated', { hidePhone: !!user.hidePhone, hideBirthDate: !!user.hideBirthDate, allowMessagesFromNonFriends: !!user.allowMessagesFromNonFriends });
      }
    } catch (e) {}
    return res.json({ message: 'Updated', hidePhone: !!user.hidePhone, hideBirthDate: !!user.hideBirthDate, allowMessagesFromNonFriends: !!user.allowMessagesFromNonFriends });
  };
}

const settingsController = new SettingsController();

module.exports = {
  SettingsController,
  getE2EE: settingsController.getE2EE,
  updateE2EE: settingsController.updateE2EE,
  getE2EEPin: settingsController.getE2EEPin,
  updateE2EEPin: settingsController.updateE2EEPin,
  getReadStatus: settingsController.getReadStatus,
  updateReadStatus: settingsController.updateReadStatus,
  getTheme: settingsController.getTheme,
  updateTheme: settingsController.updateTheme,
  getLanguage: settingsController.getLanguage,
  updateLanguage: settingsController.updateLanguage,
  getPrivacy: settingsController.getPrivacy,
  updatePrivacy: settingsController.updatePrivacy,
};
