class SettingsPrivacyChild {
  constructor(parent) {
    this.parent = parent;
  }

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

export default SettingsPrivacyChild;
