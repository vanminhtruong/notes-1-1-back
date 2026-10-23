import nodemailer from 'nodemailer';

export function getSmtpConfig(env = process.env) {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  const from = env.SMTP_FROM?.trim();
  const port = Number(env.SMTP_PORT || 587);
  if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Chưa cấu hình SMTP hợp lệ để gửi email.');
  }
  if (!from) throw new Error('Cần cấu hình SMTP_FROM bằng địa chỉ gửi đã xác minh.');
  const secure = env.SMTP_SECURE === 'true' || port === 465;
  return {
    transport: {
      host, port, secure,
      requireTLS: !secure,
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    },
    from,
  };
}

export async function sendEmail({ to, subject, text, html }, createTransport = nodemailer.createTransport) {
  const config = getSmtpConfig();
  const transporter = createTransport(config.transport);
  const info = await transporter.sendMail({ from: config.from, to, subject, text, html });
  if (!info.accepted?.length || info.rejected?.length) {
    throw new Error('Máy chủ email không chấp nhận người nhận.');
  }
  return info;
}
