import { userRepository, passwordResetRepository } from '../../repositories/index.js';
import bcrypt from 'bcryptjs';
import { sendEmail } from '../../utils/email.js';
import { sendSms } from '../../utils/sms.js';
import { randomInt } from 'node:crypto';

// Helper to resolve user by email or phone
const findUserByIdentifier = async ({ email, phone }) => {
  if (email) return await userRepository.findByEmail(email);
  if (phone) return await userRepository.findByPhone(String(phone).trim());
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
      const otp = String(randomInt(100000, 1000000));
      const otpHash = await bcrypt.hash(otp, 10);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      const resetRecord = await passwordResetRepository.create({
        userId: user.id,
        email: user.email,
        otpHash,
        expiresAt,
        used: false,
        attempts: 0,
      });

      try {
        // Send OTP via SMS if phone is used, otherwise via email
        if (phone) {
          const smsBody = `Ma OTP cua ban la ${otp}. Het han sau 10 phut.`;
          const normalized = String(phone).replace(/[\s\-()]/g, '').trim();
          await sendSms({ to: normalized, body: smsBody });
        } else {
          const subject = 'PlantHub — Mã xác minh đặt lại mật khẩu';
          const text = `Mã xác minh đặt lại mật khẩu PlantHub của bạn: ${otp}. Mã có hiệu lực trong 10 phút. Không chia sẻ mã này. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.`;
          const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#111827"><h2>PlantHub</h2><h3>Đặt lại mật khẩu</h3><p>Sử dụng mã xác minh bên dưới để tiếp tục:</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#f3f4f6;padding:20px;text-align:center;border-radius:12px">${otp}</p><p>Mã có hiệu lực trong <strong>10 phút</strong>. Không chia sẻ mã này với bất kỳ ai.</p><p style="color:#6b7280">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p></div>`;
          await sendEmail({ to: user.email, subject, text, html });
        }
        } catch {
        await resetRecord.update({ used: true });
        return res.status(503).json({ message: 'Chưa thể gửi mã xác minh. Vui lòng thử lại sau hoặc liên hệ quản trị viên.' });
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

      const record = await passwordResetRepository.findOne({
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

      const record = await passwordResetRepository.findOne({
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
