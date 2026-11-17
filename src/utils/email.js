import nodemailer from 'nodemailer';

/**
 * SMTP transport used to send real messages (never log OTP or credentials).
 * Gmail: smtp.gmail.com:587 STARTTLS + 2FA App Password.
 */
export function getSmtpConfig(env = process.env) {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.replace(/\s/g, '');
  const port = Number(env.SMTP_PORT || 587);
  if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('SMTP has not been configured with valid credentials.');
    error.code = 'SMTP_NOT_CONFIGURED';
    throw error;
  }
  const secure = env.SMTP_SECURE === 'true' || port === 465;
  const from = env.SMTP_FROM?.trim() || `PlantHub <${user}>`;
  return {
    transport: {
      host, port, secure,
      requireTLS: !secure,
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      tls: { minVersion: 'TLSv1.2' },
    },
    from,
  };
}

export async function sendEmail({ to, subject, text, html }, createTransport = nodemailer.createTransport) {
  const config = getSmtpConfig();
  const transporter = createTransport(config.transport);
  // SMTP accepted != guaranteed in Inbox, but never claim success if rejected.
  const info = await transporter.sendMail({ from: config.from, to, subject, text, html });
  if (!info.accepted?.length || info.rejected?.length) {
    const error = new Error('SMTP did not accept the recipient.');
    error.code = 'SMTP_RECIPIENT_REJECTED';
    throw error;
  }
  return info;
}
