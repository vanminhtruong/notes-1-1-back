let nodemailerOptional = null;
try {
  const nodemailer = await import('nodemailer');
  nodemailerOptional = nodemailer.default;
} catch (_) {
  nodemailerOptional = null;
}

/**
 * Send an email. If SMTP env is not configured or nodemailer is missing,
 * falls back to console logging (dev-friendly).
 * @param {Object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.text
 * @param {string} [options.html]
 */
async function sendEmail({ to, subject, text, html }) {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
  } = process.env;

  const hasSmtp = SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && nodemailerOptional;
  if (!hasSmtp) {
    // Dev fallback
    // eslint-disable-next-line no-console
    console.log('[DEV EMAIL] To:', to);
    // eslint-disable-next-line no-console
    console.log('[DEV EMAIL] Subject:', subject);
    // eslint-disable-next-line no-console
    console.log('[DEV EMAIL] Text:', text);
    if (html) {
      // eslint-disable-next-line no-console
      console.log('[DEV EMAIL] HTML:', html);
    }
    return { accepted: [to], fallback: true };
  }

  const transporter = nodemailerOptional.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_SECURE || '').toLowerCase() === 'true' || Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const info = await transporter.sendMail({
    from: SMTP_FROM || 'no-reply@example.com',
    to,
    subject,
    text,
    html,
  });
  return info;
}

export { sendEmail };
