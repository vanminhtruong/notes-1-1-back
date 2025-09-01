const { User } = require('../models');

// GET /api/v1/settings/e2ee
const getE2EE = async (req, res) => {
  const user = req.user;
  return res.json({ enabled: !!user.e2eeEnabled });
};

// PUT /api/v1/settings/e2ee { enabled: boolean }
const updateE2EE = async (req, res) => {
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
const getE2EEPin = async (req, res) => {
  const user = req.user;
  return res.json({ pinHash: user.e2eePinHash || null });
};

// PUT /api/v1/settings/e2ee/pin { pinHash: string|null, oldPinHash?: string }
const updateE2EEPin = async (req, res) => {
  const user = req.user;
  const { pinHash, oldPinHash } = req.body || {};
  if (pinHash != null && typeof pinHash !== 'string') {
    return res.status(400).json({ message: 'Invalid payload: pinHash must be string or null' });
  }
  if (oldPinHash != null && typeof oldPinHash !== 'string') {
    return res.status(400).json({ message: 'Invalid payload: oldPinHash must be string if provided' });
  }

  const hadExisting = !!user.e2eePinHash;

  // If a PIN already exists, require correct oldPinHash to change or clear it
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
const getReadStatus = async (req, res) => {
  const user = req.user;
  return res.json({ enabled: !!user.readStatusEnabled });
};

// PUT /api/v1/settings/read-status { enabled: boolean }
const updateReadStatus = async (req, res) => {
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
const getTheme = async (req, res) => {
  const user = req.user;
  // Fallback to 'light' if not set
  const mode = user.theme === 'dark' ? 'dark' : 'light';
  
  // Set cookie to prevent flash on F5
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
const updateTheme = async (req, res) => {
  const user = req.user;
  const { mode } = req.body || {};
  if (mode !== 'light' && mode !== 'dark') {
    return res.status(400).json({ message: "Invalid payload: mode must be 'light' or 'dark'" });
  }
  user.theme = mode;
  await user.save();

  // Mirror into a cookie to avoid initial paint flash on FE (not source of truth)
  try {
    res.cookie('theme', mode, {
      httpOnly: false,
      sameSite: 'lax',
      secure: false,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  } catch (e) {}

  // Optionally broadcast theme update to user's other sessions
  try {
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${user.id}`).emit('theme_updated', { mode });
    }
  } catch (e) {
    // ignore broadcast errors
  }

  return res.json({ message: 'Updated', mode });
};

// GET /api/v1/settings/language
const getLanguage = async (req, res) => {
  const user = req.user;
  const language = user.language || 'vi';
  
  // Set cookie to sync with frontend
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
const updateLanguage = async (req, res) => {
  const user = req.user;
  const { language } = req.body || {};
  if (typeof language !== 'string' || !language.trim()) {
    return res.status(400).json({ message: 'Invalid payload: language must be a non-empty string' });
  }

  user.language = language.trim();
  await user.save();

  // Mirror into a cookie so FE can read synchronously at bootstrap if needed
  try {
    res.cookie('lang', user.language, {
      httpOnly: false,
      sameSite: 'lax',
      secure: false,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  } catch (e) {}

  // Broadcast to other devices (optional)
  try {
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${user.id}`).emit('language_updated', { language: user.language });
    }
  } catch (e) {}

  return res.json({ message: 'Updated', language: user.language });
};

module.exports = { getE2EE, updateE2EE, getE2EEPin, updateE2EEPin, getReadStatus, updateReadStatus, getTheme, updateTheme, getLanguage, updateLanguage };
