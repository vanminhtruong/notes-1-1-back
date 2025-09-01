const jwt = require('jsonwebtoken');
const { User, PasswordReset } = require('../models');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('../utils/email');

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
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
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email đã được sử dụng' });
    }

    // Create new user
    const user = await User.create({ email, password, name });
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
    const { email, password } = req.body;

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

    res.json({
      message: 'Đăng nhập thành công',
      user,
      token,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
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
    const { name, avatar } = req.body;
    const user = req.user;

    const updates = {};
    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (typeof avatar === 'string') {
      const t = avatar.trim();
      updates.avatar = t ? t : null; // empty string clears avatar
    }

    await user.update(updates);

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

// Forgot Password: request OTP via email
const forgotPasswordRequest = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

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

    // Send email (dev falls back to console)
    const subject = 'Mã OTP đặt lại mật khẩu';
    const text = `Mã OTP của bạn là ${otp}. Mã sẽ hết hạn sau 10 phút.`;
    const html = `<p>Chào ${user.name || ''},</p><p>Mã OTP đặt lại mật khẩu của bạn là <b>${otp}</b>. Mã sẽ hết hạn sau <b>10 phút</b>.</p>`;
    await sendEmail({ to: user.email, subject, text, html });

    return res.json({ message: genericMsg });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Verify OTP
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'OTP không hợp lệ hoặc đã hết hạn' });
    }

    const record = await PasswordReset.findOne({
      where: { email, used: false },
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

// Reset password with OTP
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'OTP không hợp lệ hoặc đã hết hạn' });
    }

    const record = await PasswordReset.findOne({
      where: { email, used: false },
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
    // In a real-world app, you might want to blacklist the token
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
};
