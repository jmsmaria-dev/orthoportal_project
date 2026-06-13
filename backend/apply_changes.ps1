# OrthoPortal - Apply 24hr Email Reminder Changes
# Run this from the root of your orthoportal_project folder in VSCode terminal

Write-Host "Applying changes..." -ForegroundColor Cyan

# ── 1. backend/src/config.js ────────────────────────────────────────────────
Set-Content -Path "backend/src/config.js" -Value @'
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
'@

# ── 2. backend/src/services/reminderService.js ──────────────────────────────
Set-Content -Path "backend/src/services/reminderService.js" -Value @'
import nodemailer from 'nodemailer';
import { validate } from 'email-validator';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

function createTransporter() {
  if (!config.smtp.pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass
    }
  });
}

function isGenuineEmailAddress(email) {
  return validate(email || '') && !email.toLowerCase().endsWith('.test');
}

function formatAppointmentDateTime(startsAt) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: config.appTimeZone,
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(new Date(startsAt));
}

export async function sendAppointmentReminder(appointment, { markSent = true, client = null } = {}) {
  if (!isGenuineEmailAddress(appointment.email)) {
    const error = new Error(`Cannot send reminder to invalid or test email address: ${appointment.email}`);
    error.status = 400;
    throw error;
  }

  const transporter = createTransporter();
  if (!transporter) {
    const error = new Error('SMTP credentials are missing.');
    error.status = 500;
    throw error;
  }

  const info = await transporter.sendMail({
    from: config.smtp.from,
    to: appointment.email,
    subject: 'Reminder: Your OrthoSchedule appointment is tomorrow',
    text: `Hi ${appointment.patient_name},\n\nThis is a reminder that you have an appointment with ${appointment.provider_name} tomorrow on ${formatAppointmentDateTime(appointment.starts_at)}.\n\nIf you need to cancel or reschedule, please log in to OrthoSchedule.\n\nThank you,\nThe OrthoSchedule Team`
  });

  if (markSent) {
    const executor = client || pool;
    await executor.query(
      'UPDATE appointments SET reminder_sent_at = NOW(), updated_at = NOW() WHERE id = $1',
      [appointment.id]
    );
  }

  return info;
}

export async function runReminderJob() {
  const transporter = createTransporter();
  if (!transporter) {
    throw new Error('SMTP credentials are missing.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT a.id, a.starts_at, p.name AS patient_name, p.email, u.name AS provider_name
       FROM appointments a
       JOIN users p ON p.id = a.patient_id
       JOIN providers pr ON pr.id = a.provider_id
       JOIN users u ON u.id = pr.user_id
       WHERE a.status = 'booked'
         AND a.reminder_sent_at IS NULL
         AND a.starts_at BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '24 hours'
       FOR UPDATE SKIP LOCKED`
    );

    const results = { sent: 0, skipped: 0, failed: 0 };

    for (const appointment of result.rows) {
      try {
        await sendAppointmentReminder(appointment, { client });
        results.sent++;
      } catch (error) {
        if (error.status === 400) {
          console.warn(error.message);
          results.skipped++;
          continue;
        }
        results.failed++;
        throw error;
      }
    }

    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
'@

# ── 3. backend/src/routes/admin.js ──────────────────────────────────────────
Set-Content -Path "backend/src/routes/admin.js" -Value @'
import express from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendAppointmentReminder, runReminderJob } from '../services/reminderService.js';
import { config } from '../config.js';

export const adminRouter = express.Router();

// CRON_SECRET secured endpoint for GitHub Actions
adminRouter.post('/send-reminders', async (req, res, next) => {
  try {
    const secret = req.headers['x-cron-secret'];
    if (!secret || secret !== config.cronSecret) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const results = await runReminderJob();
    res.json({ message: 'Reminder job complete.', results });
  } catch (error) {
    next(error);
  }
});

adminRouter.use(authenticate, requireRole('administrator'));

adminRouter.get('/users', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, email, role, phone
       FROM users
       ORDER BY role, name`
    );
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/appointments/:id/reminder', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT a.id, a.starts_at, a.status, patient.name AS patient_name,
              patient.email, provider_user.name AS provider_name
       FROM appointments a
       JOIN users patient ON patient.id = a.patient_id
       JOIN providers p ON p.id = a.provider_id
       JOIN users provider_user ON provider_user.id = p.user_id
       WHERE a.id = $1`,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    const appointment = result.rows[0];
    if (appointment.status !== 'booked') {
      return res.status(409).json({ error: 'Only booked appointments can receive reminders.' });
    }

    const info = await sendAppointmentReminder(appointment);
    res.json({
      message: 'Reminder email sent.',
      messageId: info.messageId
    });
  } catch (error) {
    next(error);
  }
});
'@

# ── 4. backend/src/server.js ────────────────────────────────────────────────
Set-Content -Path "backend/src/server.js" -Value @'
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { query } from './db/pool.js';
import { appointmentsRouter } from './routes/appointments.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { profileRouter } from './routes/profile.js';
import { providersRouter } from './routes/providers.js';

const app = express();
const allowedOrigins = new Set([
  config.frontendOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  }
}));
app.use(express.json());

app.get('/api/health', async (_req, res, next) => {
  try {
    const result = await query('SELECT NOW() AS database_time');
    res.json({ status: 'ok', databaseTime: result.rows[0].database_time });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/providers', providersRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/admin', adminRouter);

app.use((req, res) => {
  res.status(404).json({ error: `No route found for ${req.method} ${req.path}` });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || 'Unexpected server error.' });
});

app.listen(config.port, () => {
  console.log(`OrthoSchedule API listening on http://localhost:${config.port}`);
});
'@

# ── 5. backend/src/routes/appointments.js (reminder_sent_at reset) ──────────
$apptContent = Get-Content -Path "backend/src/routes/appointments.js" -Raw
$apptContent = $apptContent -replace `
  'SET starts_at = \$1,\s+ends_at = \$2,\s+status = \$3,\s+reason = COALESCE\(\$4, reason\),\s+updated_at = NOW\(\)', `
  "SET starts_at = `$1,`n             ends_at = `$2,`n             status = `$3,`n             reason = COALESCE(`$4, reason),`n             reminder_sent_at = CASE WHEN `$1 <> starts_at THEN NULL ELSE reminder_sent_at END,`n             updated_at = NOW()"
Set-Content -Path "backend/src/routes/appointments.js" -Value $apptContent

# ── 6. backend/.env.example ─────────────────────────────────────────────────
Set-Content -Path "backend/.env.example" -Value @'
PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/orthoschedule
JWT_SECRET=replace-with-a-long-random-secret
FRONTEND_ORIGIN=http://localhost:5173
APP_TIMEZONE=America/New_York

# Resend SMTP settings
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=
EMAIL_FROM=OrthoSchedule <no-reply@orthoscheduler.com>

# Set to false - GitHub Actions handles scheduling
REMINDERS_ENABLED=false

# Shared secret between GitHub Actions and the server
CRON_SECRET=
'@

# ── 7. .github/workflows/reminders.yml ──────────────────────────────────────
New-Item -ItemType Directory -Force -Path ".github/workflows" | Out-Null
Set-Content -Path ".github/workflows/reminders.yml" -Value @'
name: Send Appointment Reminders

on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:

jobs:
  send-reminders:
    runs-on: ubuntu-latest
    timeout-minutes: 2

    steps:
      - name: Trigger reminder job
        run: |
          curl --max-time 60 --fail \
            -X POST "${{ secrets.RENDER_APP_URL }}/api/admin/send-reminders" \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
'@

# ── 8. Install/remove dependencies ──────────────────────────────────────────
Write-Host "Installing dependencies..." -ForegroundColor Cyan
Set-Location backend
npm install email-validator
npm uninstall node-cron
Set-Location ..

Write-Host ""
Write-Host "All changes applied successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Update backend/.env with your SMTP_PASS and CRON_SECRET"
Write-Host "  2. git add ."
Write-Host "  3. git commit -m 'feat: 24hr email reminders via Resend SMTP and GitHub Actions'"
Write-Host "  4. git push origin feat/24hr-email-reminders"
