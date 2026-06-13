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
