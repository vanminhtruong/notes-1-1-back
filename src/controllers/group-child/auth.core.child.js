const jwt = require('jsonwebtoken');
const { User, UserSession } = require('../../models');
const { emitToAllAdmins } = require('../../socket/socketHandler');
const { parseDeviceInfo } = require('../../utils/deviceParser');

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

class AuthCoreChild {
  constructor(parentController) {
    this.parent = parentController;
  }

  register = async (req, res) => {
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
      
      // Emit to admins about new user registration
      emitToAllAdmins('user_registered', {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt
      });
      const token = generateToken(user);

      // Set theme and language cookies to prevent flash
      setThemeAndLangCookies(res, user);

      res.status(201).json({
        message: 'Đăng ký thành công',
        user,
        token,
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  login = async (req, res) => {
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

      // Parse device information
      const userAgent = req.headers['user-agent'] || '';
      const deviceInfo = parseDeviceInfo(userAgent);
      const ipAddress = req.ip || req.connection.remoteAddress || '';

      // Calculate token expiration
      const expiresInDays = remember ? 30 : 1;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      // Create session record
      try {
        await UserSession.create({
          userId: user.id,
          token: token,
          deviceType: deviceInfo.deviceType,
          deviceName: deviceInfo.deviceName,
          browser: deviceInfo.browser,
          os: deviceInfo.os,
          ipAddress: ipAddress,
          userAgent: userAgent,
          lastActivityAt: new Date(),
          expiresAt: expiresAt,
          isActive: true,
          isCurrent: true,
        });

        // Clean up old expired sessions for this user
        await UserSession.destroy({
          where: {
            userId: user.id,
            expiresAt: { [require('sequelize').Op.lt]: new Date() }
          }
        });
      } catch (sessionErr) {
        console.error('Error creating session:', sessionErr);
      }

      // Set theme and language cookies to prevent flash
      setThemeAndLangCookies(res, user);

      // Also set httpOnly cookie for server-managed sessions (frontend may still use bearer)
      try {
        const maxAgeMs = expiresInDays * 24 * 60 * 60 * 1000; // days -> ms
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
  getRememberPreference = async (req, res) => {
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

  logout = async (req, res) => {
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

  // Soft-delete (deactivate) current account and broadcast real-time logout to all sessions
  deleteAccount = async (req, res) => {
    try {
      const user = req.user;

      // Deactivate account (soft delete)
      await user.update({ isActive: false });

      // Notify all admins so Admin UsersList can update toggle in real-time
      try {
        await emitToAllAdmins('user_status_changed', {
          userId: user.id,
          name: user.name,
          email: user.email,
          isActive: false,
          action: 'deactivated',
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error emitting user_status_changed for self-deactivation:', e);
      }

      // Emit real-time event to all of this user's sockets/tabs/devices
      try {
        if (global.io) {
          global.io.to(`user_${user.id}`).emit('account_deleted', {
            userId: user.id,
            message: 'Tài khoản của bạn đã bị xóa. Bạn sẽ được đăng xuất.',
          });
          // Optionally force disconnect sockets shortly after emitting
          try {
            setTimeout(() => {
              try { global.io.in(`user_${user.id}`).disconnectSockets(true); } catch {}
            }, 100);
          } catch {}
        }
      } catch (emitErr) {
        console.error('Error emitting account_deleted:', emitErr);
      }

      // Clear server auth cookie
      try {
        res.clearCookie('auth_token', { httpOnly: true, sameSite: 'lax', secure: false, path: '/' });
      } catch {}

      return res.json({ message: 'Xóa tài khoản thành công' });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  };
}

module.exports = AuthCoreChild;
