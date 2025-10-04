import { User, PasswordReset } from '../../models/index.js';
import bcrypt from 'bcryptjs';
import { sendEmail } from '../../utils/email.js';
import { sendSms } from '../../utils/sms.js';

// Helper to resolve user by email or phone
const findUserByIdentifier = async ({ email, phone }) => {
  if (email) return await User.findOne({ where: { email } });
  if (phone) return await User.findOne({ where: { phone: String(phone).trim() } });
  return null;
};

class AuthPasswordResetChild {
  constructor(parentController) {
    this.parent = parentController;
  }

  // Forgot Password: request OTP via email or phone (phone resolves to user's email)
  forgotPasswordRequest = async (req, res) => {
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
  verifyOtp = async (req, res) => {
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
  resetPassword = async (req, res) => {
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
}

export default AuthPasswordResetChild;
