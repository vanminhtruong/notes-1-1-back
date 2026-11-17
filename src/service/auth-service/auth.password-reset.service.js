import { userRepository, passwordResetRepository } from '../../repositories/index.js';
import bcrypt from 'bcryptjs';
import { sendEmail } from '../../utils/email.js';
import { isTextbeeConfigured, sendTextbeeOtp } from '../../utils/textbee.js';
import { randomInt, randomBytes, createHash } from 'node:crypto';
import { Op, col, fn, where } from 'sequelize';

// Match saved phone formatting without changing the user's profile.
const phoneVariants = (value) => {
  const compact = String(value || '').replace(/[\s\-().]/g, '');
  const values = new Set([compact]);
  if (/^0\d{9,10}$/.test(compact)) {
    values.add('84' + compact.slice(1));
    values.add('+84' + compact.slice(1));
  } else if (/^\+84\d{9,10}$/.test(compact)) {
    values.add('0' + compact.slice(3));
    values.add(compact.slice(1));
  } else if (/^84\d{9,10}$/.test(compact)) {
    values.add('0' + compact.slice(2));
    values.add('+' + compact);
  }
  return [...values];
};

const findUserByIdentifier = async ({ email, phone }) => {
  if (email) return userRepository.findByEmail(email);
  if (!phone) return null;
  const normalizedPhone = [' ', '-', '(', ')', '.'].reduce(
    (expr, char) => fn('REPLACE', expr, char, ''), col('phone')
  );
  return userRepository.findOne({
    where: where(normalizedPhone, { [Op.in]: phoneVariants(phone) }),
  });
};

const smsNumber = (phone) => {
  const compact = String(phone).replace(/[\s\-().]/g, '');
  if (/^0\d{9,10}$/.test(compact)) return '+84' + compact.slice(1);
  if (/^84\d{9,10}$/.test(compact)) return '+' + compact;
  return compact;
};

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const invalidOtp = (res) => res.status(400).json({
  code: 'OTP_INVALID', message: 'OTP không hợp lệ hoặc đã hết hạn',
});
const getLatest = (email) => passwordResetRepository.findOne({
  where: { email, used: false },
  order: [['createdAt', 'DESC']],
});

class AuthPasswordResetChild {
  constructor(parentController) {
    this.parent = parentController;
  }

  forgotPasswordRequest = async (req, res) => {
    try {
      const { email, phone } = req.body;
      const user = await findUserByIdentifier({ email, phone });
      const genericMsg = 'Nếu email tồn tại, mã OTP đã được gửi.';

      if (phone && (!user || !user.isActive)) {
        return res.status(404).json({
          code: 'PHONE_NOT_REGISTERED',
          message: 'Số điện thoại không khớp với hồ sơ đã đăng ký.',
        });
      }
      if (!user || !user.isActive) return res.json({ message: genericMsg });

      if (phone && !isTextbeeConfigured()) {
        return res.status(503).json({
          code: 'SMS_UNAVAILABLE',
          message: 'Chưa cấu hình dịch vụ SMS thật. Vui lòng dùng email hoặc thử lại sau.',
        });
      }

      // Avoid rapid repeated sends (free quotas are small) and repeated resets.
      const recent = await passwordResetRepository.findOne({
        where: { userId: user.id, used: false },
        order: [['createdAt', 'DESC']],
      });
      if (recent && Date.now() - new Date(recent.createdAt).getTime() < 60_000) {
        return res.status(429).json({
          code: 'OTP_COOLDOWN', message: 'Vui lòng đợi ít nhất 60 giây trước khi yêu cầu mã mới.',
        });
      }
      const hourlyCount = await passwordResetRepository.count({
        where: { userId: user.id, createdAt: { [Op.gte]: new Date(Date.now() - 60 * 60_000) } },
      });
      if (hourlyCount >= 5) {
        return res.status(429).json({
          code: 'OTP_RATE_LIMIT', message: 'Đã yêu cầu quá nhiều OTP. Vui lòng thử lại sau.',
        });
      }

      if (phone) {
        // Generate OTP on this backend and keep only its bcrypt hash in SQLite.
        // textbee merely queues SMS for the Android phone to send via its SIM.
        const otp = String(randomInt(100000, 1000000));
        const otpHash = await bcrypt.hash(otp, 10);
        let sent;
        try {
          sent = await sendTextbeeOtp({ phone: smsNumber(user.phone), otp });
        } catch (err) {
          // Report a safe error category, never the provider body or API key.
          const code = err?.code === 'quota_exceeded' ? 'SMS_QUOTA_EXCEEDED'
            : err?.code === 'unauthorized' ? 'SMS_KEY_REJECTED'
            : err?.code === 'not_ready' ? 'SMS_GATEWAY_NOT_READY'
            : err?.code === 'not_configured' ? 'SMS_NOT_CONFIGURED'
            : 'SMS_UNAVAILABLE';
          return res.status(code === 'SMS_QUOTA_EXCEEDED' ? 429 : 503).json({
            code,
            message: 'Không thể gửi OTP qua SMS. Vui lòng kiểm tra kết nối textbee hoặc dùng email.',
          });
        }
        await passwordResetRepository.update({ used: true }, {
          where: { userId: user.id, used: false },
        });
        await passwordResetRepository.create({
          userId: user.id,
          email: user.email,
          otpHash,
          providerRequestId: 'textbee:' + sent.batchId,
          expiresAt: new Date(Date.now() + 10 * 60_000),
          used: false,
          attempts: 0,
          resetTokenHash: null,
        });
        return res.json({
          message: 'Đã xếp hàng gửi OTP qua textbee. Vui lòng kiểm tra SMS.',
          channel: 'sms',
          status: 'queued',
        });
      }

      // Preserve existing email password recovery.
      const otp = String(randomInt(100000, 1000000));
      const otpHash = await bcrypt.hash(otp, 10);
      await passwordResetRepository.update({ used: true }, {
        where: { userId: user.id, used: false },
      });
      const record = await passwordResetRepository.create({
        userId: user.id, email: user.email, otpHash,
        providerRequestId: null, resetTokenHash: null,
        expiresAt: new Date(Date.now() + 10 * 60_000), used: false, attempts: 0,
      });
      try {
        const subject = 'PlantHub — Mã xác minh đặt lại mật khẩu';
        const text = `Mã xác minh đặt lại mật khẩu PlantHub của bạn: ${otp}. Mã có hiệu lực trong 10 phút. Không chia sẻ mã này. Nếu bạn không yêu cầu, hãy bỏ qua email này.`;
        const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#111827"><h2>PlantHub</h2><h3>Đặt lại mật khẩu</h3><p>Sử dụng mã xác minh bên dưới:</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#f3f4f6;padding:20px;text-align:center;border-radius:12px">${otp}</p><p>Mã có hiệu lực trong 10 phút. Không chia sẻ mã này với bất kỳ ai.</p></div>`;
        await sendEmail({ to: user.email, subject, text, html });
      } catch (err) {
        await record.update({ used: true });
        return res.status(503).json({
          code: err?.code === 'SMTP_NOT_CONFIGURED' ? 'EMAIL_NOT_CONFIGURED' : 'EMAIL_UNAVAILABLE',
          message: 'Chưa thể gửi OTP qua email. Vui lòng kiểm tra dịch vụ email hoặc thử lại sau.',
        });
      }
      return res.json({ message: genericMsg });
    } catch {
      return res.status(500).json({ message: 'Không thể yêu cầu OTP lúc này.' });
    }
  };

  verifyOtp = async (req, res) => {
    try {
      const { email, phone, otp } = req.body;
      const user = await findUserByIdentifier({ email, phone });
      if (!user || !user.isActive) return invalidOtp(res);
      const record = await getLatest(user.email);
      if (!record || new Date(record.expiresAt).getTime() < Date.now()) return invalidOtp(res);
      if (record.attempts >= 5) {
        await record.update({ used: true });
        return invalidOtp(res);
      }

      if (phone) {
        if (!record.providerRequestId?.startsWith('textbee:')) return invalidOtp(res);
        if (record.resetTokenHash) return res.status(409).json({
          code: 'OTP_ALREADY_VERIFIED', message: 'Mã OTP đã được xác minh.',
        });
        const match = await bcrypt.compare(otp, record.otpHash);
        if (!match) {
          const attempts = record.attempts + 1;
          await record.update({ attempts, ...(attempts >= 5 ? { used: true } : {}) });
          return invalidOtp(res);
        }
        const resetToken = randomBytes(32).toString('hex');
        await record.update({
          resetTokenHash: hashToken(resetToken),
          attempts: record.attempts + 1,
        });
        return res.json({ message: 'Xác thực OTP thành công', resetToken });
      }

      if (record.providerRequestId) return invalidOtp(res);
      const match = await bcrypt.compare(otp, record.otpHash);
      await record.update({ attempts: record.attempts + 1 });
      if (!match) return invalidOtp(res);
      return res.json({ message: 'Xác thực OTP thành công' });
    } catch {
      return res.status(500).json({ message: 'Không thể xác thực OTP lúc này.' });
    }
  };

  resetPassword = async (req, res) => {
    try {
      const { email, phone, otp, resetToken, newPassword } = req.body;
      const user = await findUserByIdentifier({ email, phone });
      if (!user || !user.isActive) return invalidOtp(res);
      const record = await getLatest(user.email);
      if (!record || new Date(record.expiresAt).getTime() < Date.now()) return invalidOtp(res);
      if (record.attempts >= 5 && !record.resetTokenHash) {
        await record.update({ used: true });
        return invalidOtp(res);
      }

      if (phone) {
        if (!record.providerRequestId?.startsWith('textbee:') || !record.resetTokenHash || typeof resetToken !== 'string') {
          return invalidOtp(res);
        }
        if (!/^[a-f0-9]{64}$/i.test(resetToken) || hashToken(resetToken) !== record.resetTokenHash) {
          return invalidOtp(res);
        }
      } else {
        if (record.providerRequestId) return invalidOtp(res);
        const match = await bcrypt.compare(otp, record.otpHash);
        if (!match) {
          const attempts = record.attempts + 1;
          await record.update({ attempts, ...(attempts >= 5 ? { used: true } : {}) });
          return invalidOtp(res);
        }
      }

      // Consume reset record before changing password, guarding concurrent submissions.
      const [claimed] = await passwordResetRepository.update({ used: true }, {
        where: { id: record.id, used: false, expiresAt: { [Op.gt]: new Date() } },
      });
      if (claimed !== 1) return invalidOtp(res);
      await user.update({ password: newPassword });
      return res.json({ message: 'Đặt lại mật khẩu thành công' });
    } catch {
      return res.status(500).json({ message: 'Không thể đặt lại mật khẩu lúc này.' });
    }
  };
}

export default AuthPasswordResetChild;
