class SettingsAppearanceChild {
  constructor(parent) {
    this.parent = parent;
  }

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
}

export default SettingsAppearanceChild;
