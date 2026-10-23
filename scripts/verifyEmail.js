import 'dotenv/config';
import nodemailer from 'nodemailer';
import { getSmtpConfig } from '../src/utils/email.js';

try {
  const { transport } = getSmtpConfig();
  await nodemailer.createTransport(transport).verify();
  console.log('[Email] SMTP connection and authentication verified. No email was sent.');
} catch (error) {
  console.error('[Email] SMTP verification failed:', error.code || 'CONFIGURATION_ERROR');
  process.exitCode = 1;
}
