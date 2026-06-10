import express from 'express';
import { query, withTransaction } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getAvailability } from '../services/availabilityService.js';

export const appointmentsRouter = express.Router();

appointmentsRouter.use(authenticate);

function dateBounds(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function ensurePatientDailyLimit(client, patientId, startsAt, excludeAppointmentId = null) {
  const { start, end } = dateBounds(startsAt);
  const result = await client.query(
    `SELECT id
     FROM appointments
     WHERE patient_id = $1
       AND status = 'booked'
       AND starts_at >= $2
       AND starts_at < $3
       AND ($4::BIGINT IS NULL OR id <> $4)
     LIMIT 1`,
    [patientId, start, end, excludeAppointmentId]
  );

  if (result.rowCount > 0) {
    const error = new Error('Patients can only book one appointment per day. Please call support at 888-888-8888 for help.');
    error.status = 409;
    throw error;
  }
}

appointmentsRouter.get('/', async (req, res, next) => {
  try {
    const baseSelect = `
      SELECT a.id, a.starts_at, a.ends_at, a.status, a.reason,
             a.patient_id, a.provider_id,
             patient.name AS patient_name,
             provider_user.name AS provider_name,
             p.specialty, p.location
      FROM appointments a
      JOIN users patient ON patient.id = a.patient_id
      JOIN providers p ON p.id = a.provider_id
      JOIN users provider_user ON provider_user.id = p.user_id`;

    let result;
    if (req.user.role === 'patient') {
      result = await query(`${baseSelect} WHERE a.patient_id = $1 ORDER BY a.starts_at`, [req.user.sub]);
    } else if (req.user.role === 'provider') {
      result = await query(
        `${baseSelect}
         WHERE p.user_id = $1
         ORDER BY a.starts_at`,
        [req.user.sub]
      );
    } else {
      result = await query(`${baseSelect} ORDER BY a.starts_at`);
    }

    res.json({ appointments: result.rows });
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.post('/', requireRole('patient', 'administrator'), async (req, res, next) => {
  try {
    const { providerId, startsAt, reason, patientId } = req.body;
    if (!providerId || !startsAt) {
      return res.status(400).json({ error: 'Provider and start time are required.' });
    }

    const bookingPatientId = req.user.role === 'administrator' ? patientId : req.user.sub;
    if (!bookingPatientId) {
      return res.status(400).json({ error: 'Admin bookings require a patient.' });
    }

    const requestedStart = new Date(startsAt);
    const requestedDate = requestedStart.toISOString().slice(0, 10);
    const availableSlots = await getAvailability(providerId, requestedDate);
    const isAvailable = availableSlots.some((slot) => slot.startsAt === requestedStart.toISOString());
    if (!isAvailable) {
      return res.status(409).json({ error: 'That appointment slot is unavailable.' });
    }

    const appointment = await withTransaction(async (client) => {
      const providerResult = await client.query(
        'SELECT appointment_duration_minutes FROM providers WHERE id = $1',
        [providerId]
      );

      if (providerResult.rowCount === 0) {
        const error = new Error('Provider not found.');
        error.status = 404;
        throw error;
      }

      const startsAtDate = requestedStart;
      if (req.user.role === 'patient') {
        await ensurePatientDailyLimit(client, bookingPatientId, startsAtDate);
      }

      const duration = providerResult.rows[0].appointment_duration_minutes;
      const endsAtDate = new Date(startsAtDate.getTime() + duration * 60 * 1000);

      const result = await client.query(
        `INSERT INTO appointments (patient_id, provider_id, starts_at, ends_at, reason)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, patient_id, provider_id, starts_at, ends_at, status, reason`,
        [bookingPatientId, providerId, startsAtDate, endsAtDate, reason || null]
      );

      return result.rows[0];
    });

    res.status(201).json({ appointment });
  } catch (error) {
    if (error.code === '23P01') {
      return res.status(409).json({ error: 'That appointment slot was just booked. Please choose another time.' });
    }
    next(error);
  }
});

appointmentsRouter.patch('/:id', requireRole('patient', 'administrator'), async (req, res, next) => {
  try {
    const { startsAt, status, reason } = req.body;

    const appointment = await withTransaction(async (client) => {
      const existingResult = await client.query(
        `SELECT a.*, p.appointment_duration_minutes
         FROM appointments a
         JOIN providers p ON p.id = a.provider_id
         WHERE a.id = $1 AND ($2::user_role = 'administrator' OR a.patient_id = $3)
         FOR UPDATE`,
        [req.params.id, req.user.role, req.user.sub]
      );

      if (existingResult.rowCount === 0) {
        const error = new Error('Appointment not found.');
        error.status = 404;
        throw error;
      }

      const existing = existingResult.rows[0];
      const nextStart = startsAt ? new Date(startsAt) : existing.starts_at;
      const nextEnd = startsAt
        ? new Date(nextStart.getTime() + existing.appointment_duration_minutes * 60 * 1000)
        : existing.ends_at;
      const nextStatus = status || existing.status;

      if (startsAt && nextStatus === 'booked') {
        const availableSlots = await getAvailability(existing.provider_id, nextStart.toISOString().slice(0, 10));
        const isAvailable = availableSlots.some((slot) => slot.startsAt === nextStart.toISOString());
        if (!isAvailable) {
          const error = new Error('That appointment slot is unavailable.');
          error.status = 409;
          throw error;
        }

        if (req.user.role === 'patient') {
          await ensurePatientDailyLimit(client, existing.patient_id, nextStart, existing.id);
        }
      }

      const result = await client.query(
        `UPDATE appointments
         SET starts_at = $1,
             ends_at = $2,
             status = $3,
             reason = COALESCE($4, reason),
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, patient_id, provider_id, starts_at, ends_at, status, reason`,
        [nextStart, nextEnd, nextStatus, reason || null, req.params.id]
      );

      return result.rows[0];
    });

    res.json({ appointment });
  } catch (error) {
    if (error.code === '23P01') {
      return res.status(409).json({ error: 'That appointment slot is unavailable.' });
    }
    next(error);
  }
});

appointmentsRouter.delete('/:id', requireRole('patient', 'administrator'), async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE appointments
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND ($2::user_role = 'administrator' OR patient_id = $3)
       RETURNING id, status`,
      [req.params.id, req.user.role, req.user.sub]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    res.json({ appointment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
