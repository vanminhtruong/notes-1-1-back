class SettingsReadStatusChild {
  constructor(parent) {
    this.parent = parent;
  }

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
}

export default SettingsReadStatusChild;
