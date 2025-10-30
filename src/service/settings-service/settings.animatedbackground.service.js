class SettingsAnimatedBackgroundChild {
  constructor(parent) {
    this.parent = parent;
  }

  // GET /api/v1/settings/animated-background
  getAnimatedBackground = async (req, res) => {
    const user = req.user;
    const animatedBackground = user.animatedBackground || { enabled: false, theme: 'none' };
    return res.json(animatedBackground);
  };

  // PUT /api/v1/settings/animated-background { enabled: boolean, theme: 'christmas' | 'tet' | 'easter' | 'none' }
  updateAnimatedBackground = async (req, res) => {
    const user = req.user;
    const { enabled, theme } = req.body || {};

    // Validate enabled
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'Invalid payload: enabled must be a boolean' });
    }

    // Validate theme (extend with 'halloween')
    const validThemes = ['christmas', 'tet', 'easter', 'halloween', 'none'];
    if (!validThemes.includes(theme)) {
      return res.status(400).json({ 
        message: `Invalid payload: theme must be one of ${validThemes.join(', ')}` 
      });
    }

    // Update user settings
    user.animatedBackground = { enabled, theme };
    await user.save();

    // Emit socket event for real-time update
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${user.id}`).emit('animated_background_updated', { enabled, theme });
      }
    } catch (e) {
      // Silent fail for socket
    }

    return res.json({ 
      message: 'Animated background settings updated', 
      enabled, 
      theme 
    });
  };
}

export default SettingsAnimatedBackgroundChild;
