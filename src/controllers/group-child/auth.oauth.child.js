const jwt = require('jsonwebtoken');
const { User } = require('../../models');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const crypto = require('crypto');
const { emitToAllAdmins } = require('../../socket/socketHandler');

const generateToken = (user, options = {}) => {
  const expiresIn = options.expiresIn || process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

const setThemeAndLangCookies = (res, user) => {
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
};

class AuthOAuthChild {
  constructor(parentController) {
    this.parent = parentController;
  }

  // Google Login: verify ID token from client and issue our JWT
  googleLogin = async (req, res) => {
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
        
        // Emit to admins about new user registration
        emitToAllAdmins('user_registered', {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt
        });
      }

      // If user inactive
      if (!user.isActive) {
        return res.status(401).json({ message: 'Tài khoản đã bị vô hiệu hóa' });
      }

      const token = generateToken(user);

      // Set theme and language cookies to prevent flash
      setThemeAndLangCookies(res, user);

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
  facebookLogin = async (req, res) => {
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
        
        // Emit to admins about new user registration
        emitToAllAdmins('user_registered', {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt
        });
      }

      // If user inactive
      if (!user.isActive) {
        return res.status(401).json({ message: 'Tài khoản đã bị vô hiệu hóa' });
      }

      const token = generateToken(user);

      // Set theme and language cookies to prevent flash
      setThemeAndLangCookies(res, user);

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
}

module.exports = AuthOAuthChild;
