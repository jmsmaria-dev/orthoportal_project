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
