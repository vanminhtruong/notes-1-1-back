class SettingsE2EEChild {
  constructor(parent) {
    this.parent = parent;
  }

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
}

export default SettingsE2EEChild;
