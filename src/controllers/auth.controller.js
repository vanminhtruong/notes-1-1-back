const jwt = require('jsonwebtoken');
const { User, PasswordReset } = require('../models');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('../utils/email');
const { sendSms } = require('../utils/sms');

const generateToken = (user, options = {}) => {
  const expiresIn = options.expiresIn || process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

// Google Login: verify ID token from client and issue our JWT
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: 'Thiếu idToken' });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: 'Thiếu cấu hình GOOGLE_CLIENT_ID' });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();

    const email = payload.email;
    const name = payload.name || email.split('@')[0];

    if (!email) {
      return res.status(400).json({ message: 'Không lấy được email từ Google' });
    }

    // Find or create user
    let user = await User.findOne({ where: { email } });
    if (!user) {
      // Create a random password to satisfy model constraints
      const randomPassword = crypto.randomBytes(24).toString('hex');
      user = await User.create({ email, name, password: randomPassword });
    }

    // If user inactive
    if (!user.isActive) {
      return res.status(401).json({ message: 'Tài khoản đã bị vô hiệu hóa' });
    }

    const token = generateToken(user);

    // Set theme and language cookies to prevent flash
    try {
      res.cookie('theme', user.theme || 'light', {
        httpOnly: false, sameSite: 'lax', secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000, path: '/',
      });
      res.cookie('lang', user.language || 'vi', {
        httpOnly: false, sameSite: 'lax', secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000, path: '/',
      });
    } catch (e) {}

    return res.json({
      message: 'Đăng nhập Google thành công',
      user,
      token,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Facebook Login: verify access token with Facebook Graph API
const facebookLogin = async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ message: 'Thiếu accessToken' });
    }

    // Verify access token with Facebook Graph API
    const facebookResponse = await axios.get(
      `https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email`
    );

    const { id: facebookId, name, email } = facebookResponse.data;

    if (!email) {
      return res.status(400).json({ message: 'Không lấy được email từ Facebook' });
    }

    // Find or create user
    let user = await User.findOne({ where: { email } });
    if (!user) {
      // Create a random password to satisfy model constraints
      const randomPassword = crypto.randomBytes(24).toString('hex');
      user = await User.create({ 
        email, 
        name: name || email.split('@')[0], 
        password: randomPassword 
      });
    }

    // If user inactive
    if (!user.isActive) {
      return res.status(401).json({ message: 'Tài khoản đã bị vô hiệu hóa' });
    }

    const token = generateToken(user);

    // Set theme and language cookies to prevent flash
    try {
      res.cookie('theme', user.theme || 'light', {
        httpOnly: false, sameSite: 'lax', secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000, path: '/',
      });
      res.cookie('lang', user.language || 'vi', {
        httpOnly: false, sameSite: 'lax', secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000, path: '/',
      });
    } catch (e) {}

    return res.json({
      message: 'Đăng nhập Facebook thành công',
      user,
      token,
    });
  } catch (error) {
    // Handle Facebook API errors
    if (error.response?.status === 400) {
      return res.status(400).json({ message: 'Access token không hợp lệ' });
    }
    return res.status(400).json({ message: error.message });
  }
};

const register = async (req, res) => {
  try {
    const { email, password, name, phone, birthDate, gender } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email đã được sử dụng' });
    }

    // Create new user
    const user = await User.create({
      email,
      password,
      name,
      // Optional fields
      phone: typeof phone === 'string' ? (phone.trim() || null) : (phone ?? null),
      birthDate: birthDate ? birthDate : null,
      gender: gender || 'unspecified',
    });
    const token = generateToken(user);

    // Set theme and language cookies to prevent flash
    try {
      res.cookie('theme', user.theme || 'light', {
        httpOnly: false, sameSite: 'lax', secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000, path: '/',
      });
      res.cookie('lang', user.language || 'vi', {
        httpOnly: false, sameSite: 'lax', secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000, path: '/',
      });
    } catch (e) {}

    res.status(201).json({
      message: 'Đăng ký thành công',
      user,
      token,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password, remember } = req.body;

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    // Check password
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ message: 'Tài khoản đã bị vô hiệu hóa' });
    }

    const token = generateToken(user);

    // Set theme and language cookies to prevent flash
    try {
      res.cookie('theme', user.theme || 'light', {
        httpOnly: false, sameSite: 'lax', secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000, path: '/',
      });
      res.cookie('lang', user.language || 'vi', {
        httpOnly: false, sameSite: 'lax', secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000, path: '/',
      });
    } catch (e) {}

    // Also set httpOnly cookie for server-managed sessions (frontend may still use bearer)
    try {
      const maxAgeMs = (remember ? 30 : 1) * 24 * 60 * 60 * 1000; // days -> ms
      res.cookie('auth_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: maxAgeMs,
        path: '/',
      });
      // UI helper cookie to remember the checkbox state on the client without localStorage
      res.cookie('remember_ui', remember ? '1' : '0', {
        httpOnly: false,
        sameSite: 'lax',
        secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });
      // UI helper cookie to persist last used email for prefill
      res.cookie('last_email', email, {
        httpOnly: false,
        sameSite: 'lax',
        secure: false,
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    } catch (e) {}

    // Persist remember preference on backend
    try {
      if (typeof remember !== 'undefined') {
        await user.update({ rememberLogin: !!remember });
      }
    } catch (e) {}

    res.json({
      message: 'Đăng nhập thành công',
      user,
      token,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Public endpoint to fetch remember preference by email (returns false if not found)
const getRememberPreference = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    const remember = user ? !!user.rememberLogin : false;
    // Always 200 with generic payload to reduce enumeration risk
    return res.json({ remember });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [{
        association: 'notes',
        attributes: ['id', 'title', 'createdAt'],
      }],
    });

    res.json({
      user,
      totalNotes: user.notes.length,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, avatar, phone, birthDate, gender } = req.body;
    const user = req.user;

    const updates = {};
    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (typeof avatar === 'string') {
      const t = avatar.trim();
      updates.avatar = t ? t : null; // empty string clears avatar
    }
    if (typeof phone !== 'undefined') {
      if (phone === '' || phone === null) updates.phone = null; else updates.phone = String(phone).trim();
    }
    if (typeof birthDate !== 'undefined') {
      updates.birthDate = birthDate ? birthDate : null;
    }
    if (typeof gender === 'string') {
      updates.gender = gender;
    }

    await user.update(updates);

    // Emit profile update to all connected friends for real-time sync
    try {
      const { Friendship } = require('../models');
      const friendships = await Friendship.findAll({
        where: {
          [require('sequelize').Op.or]: [
            { requesterId: user.id, status: 'accepted' },
            { addresseeId: user.id, status: 'accepted' }
          ]
        }
      });

      for (const friendship of friendships) {
        const friendId = friendship.requesterId === user.id ? friendship.addresseeId : friendship.requesterId;
        if (friendId && global.io) {
          global.io.to(`user_${friendId}`).emit('user_profile_updated', {
            userId: user.id,
            user: {
              id: user.id,
              name: user.name,
              avatar: user.avatar,
              phone: user.phone,
              birthDate: user.birthDate,
              gender: user.gender,
              email: user.email,
              isOnline: true // Assume online since they just updated
            }
          });
        }
      }
    } catch (emitError) {
      console.error('Error emitting profile update:', emitError);
    }

    res.json({
      message: 'Cập nhật thông tin thành công',
      user,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;

    // Validate current password
    const isValidPassword = await user.validatePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
    }

    // Update password
    await user.update({ password: newPassword });

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Helper to resolve user by email or phone
const findUserByIdentifier = async ({ email, phone }) => {
  if (email) return await User.findOne({ where: { email } });
  if (phone) return await User.findOne({ where: { phone: String(phone).trim() } });
  return null;
};

// Forgot Password: request OTP via email or phone (phone resolves to user's email)
const forgotPasswordRequest = async (req, res) => {
  try {
    const { email, phone } = req.body;
    const user = await findUserByIdentifier({ email, phone });

    // Always return success (email enumeration safe)
    const genericMsg = 'Nếu email tồn tại, mã OTP đã được gửi.';

    if (!user || !user.isActive) {
      return res.json({ message: genericMsg });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await PasswordReset.create({
      userId: user.id,
      email: user.email,
      otpHash,
      expiresAt,
      used: false,
      attempts: 0,
    });

    // Send OTP via SMS if phone is used, otherwise via email
    if (phone) {
      const smsBody = `Ma OTP cua ban la ${otp}. Het han sau 10 phut.`;
      const normalized = String(phone).replace(/[\s\-()]/g, '').trim();
      await sendSms({ to: normalized, body: smsBody });
    } else {
      // Email fallback
      const subject = 'Mã OTP đặt lại mật khẩu';
      const text = `Mã OTP của bạn là ${otp}. Mã sẽ hết hạn sau 10 phút.`;
      const html = `<p>Chào ${user.name || ''},</p><p>Mã OTP đặt lại mật khẩu của bạn là <b>${otp}</b>. Mã sẽ hết hạn sau <b>10 phút</b>.</p>`;
      await sendEmail({ to: user.email, subject, text, html });
    }

    return res.json({ message: genericMsg });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Verify OTP with email or phone
const verifyOtp = async (req, res) => {
  try {
    const { email, phone, otp } = req.body;

    const user = await findUserByIdentifier({ email, phone });
    if (!user) {
      return res.status(400).json({ message: 'OTP không hợp lệ hoặc đã hết hạn' });
    }

    const record = await PasswordReset.findOne({
      where: { email: user.email, used: false },
      order: [['createdAt', 'DESC']],
    });

    if (!record) {
      return res.status(400).json({ message: 'OTP không hợp lệ hoặc đã hết hạn' });
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ message: 'OTP đã hết hạn' });
    }

    // Limit attempts
    if (record.attempts >= 5) {
      await record.update({ used: true });
      return res.status(400).json({ message: 'Bạn đã thử quá số lần cho phép. Hãy yêu cầu OTP mới.' });
    }

    const match = await bcrypt.compare(otp, record.otpHash);
    await record.update({ attempts: record.attempts + 1 });

    if (!match) {
      return res.status(400).json({ message: 'OTP không đúng' });
    }

    return res.json({ message: 'Xác thực OTP thành công' });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Reset password with OTP (email or phone)
const resetPassword = async (req, res) => {
  try {
    const { email, phone, otp, newPassword } = req.body;

    const user = await findUserByIdentifier({ email, phone });
    if (!user) {
      return res.status(400).json({ message: 'OTP không hợp lệ hoặc đã hết hạn' });
    }

    const record = await PasswordReset.findOne({
      where: { email: user.email, used: false },
      order: [['createdAt', 'DESC']],
    });

    if (!record) {
      return res.status(400).json({ message: 'OTP không hợp lệ hoặc đã hết hạn' });
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ message: 'OTP đã hết hạn' });
    }

    const match = await bcrypt.compare(otp, record.otpHash);
    if (!match) {
      await record.update({ attempts: record.attempts + 1 });
      return res.status(400).json({ message: 'OTP không đúng' });
    }

    // Update password (model hook will hash)
    await user.update({ password: newPassword });
    await record.update({ used: true });

    return res.json({ message: 'Đặt lại mật khẩu thành công' });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

const logout = async (req, res) => {
  try {
    // Clear only server auth cookie; keep UI cookies (remember_ui, last_email)
    try {
      res.clearCookie('auth_token', { httpOnly: true, sameSite: 'lax', secure: false, path: '/' });
    } catch {}
    res.json({ message: 'Đăng xuất thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  googleLogin,
  facebookLogin,
  forgotPasswordRequest,
  verifyOtp,
  resetPassword,
  getRememberPreference,
};
