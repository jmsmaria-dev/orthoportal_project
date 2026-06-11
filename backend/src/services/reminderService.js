import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { pool, query } from '../db/pool.js';

function createTransporter() {
  if (!config.smtp.user || !config.smtp.pass) {
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') && !email.toLowerCase().endsWith('.test');
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
    subject: 'Your OrthoSchedule appointment reminder',
    text: `Hi ${appointment.patient_name}, this is a reminder for your appointment with ${appointment.provider_name} on ${formatAppointmentDateTime(appointment.starts_at)}.`
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

export function startReminderJob() {
  if (!config.remindersEnabled) {
    console.log('Appointment reminders are disabled.');
    return;
  }

  const transporter = createTransporter();
  if (!transporter) {
    console.warn('Appointment reminders enabled, but SMTP credentials are missing.');
    return;
  }

  cron.schedule('*/15 * * * *', async () => {
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
           AND a.starts_at BETWEEN NOW() AND NOW() + INTERVAL '12 hours'
         FOR UPDATE SKIP LOCKED`
      );

      for (const appointment of result.rows) {
        try {
          await sendAppointmentReminder(appointment, { client });
        } catch (error) {
          if (error.status === 400) {
            console.warn(error.message);
            continue;
          }
          throw error;
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Reminder job failed:', error);
    } finally {
      client.release();
    }
  });

  query('SELECT NOW()').catch(() => {});
  console.log('Appointment reminder job started.');
}
