import dotenv from 'dotenv';

dotenv.config();

const appTimeZone = process.env.APP_TIMEZONE || process.env.TZ || 'America/New_York';
process.env.TZ = appTimeZone;

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  appTimeZone,
  remindersEnabled: process.env.REMINDERS_ENABLED === 'true',
  cronSecret: process.env.CRON_SECRET,
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.resend.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== 'false',
    user: process.env.SMTP_USER || 'resend',
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'OrthoSchedule <no-reply@orthoscheduler.com>'
  }
};
