import express from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getAvailability } from '../services/availabilityService.js';

export const providersRouter = express.Router();

providersRouter.get('/', async (req, res, next) => {
  try {
    const { search = '' } = req.query;
    const result = await query(
      `SELECT p.id, u.name, u.email, u.phone, p.specialty, p.location, p.bio,
              p.education, p.years_experience, p.rating, p.reviews
       FROM providers p
       JOIN users u ON u.id = p.user_id
       WHERE $1 = ''
          OR u.name ILIKE '%' || $1 || '%'
          OR p.specialty ILIKE '%' || $1 || '%'
       ORDER BY u.name`,
      [search]
    );
    res.json({ providers: result.rows });
  } catch (error) {
    next(error);
  }
});

providersRouter.get('/:id/availability', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'A valid date query parameter is required.' });
    }

    const slots = await getAvailability(req.params.id, date);
    res.json({ slots });
  } catch (error) {
    next(error);
  }
});

providersRouter.get('/:id/availability/month', async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'A valid month query parameter is required.' });
    }

    const [year, monthIndex] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthIndex, 0).getDate();
    const days = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const slots = await getAvailability(req.params.id, date);
      days.push({ date, available: slots.length > 0, slotCount: slots.length });
    }

    res.json({ days });
  } catch (error) {
    next(error);
  }
});

providersRouter.get('/me/schedule', authenticate, requireRole('provider'), async (req, res, next) => {
  try {
    const providerResult = await query('SELECT id FROM providers WHERE user_id = $1', [req.user.sub]);
    if (providerResult.rowCount === 0) {
      return res.status(404).json({ error: 'Provider profile not found.' });
    }

    const providerId = providerResult.rows[0].id;
    const [hoursResult, absencesResult] = await Promise.all([
      query(
        `SELECT id, day_of_week, start_time, end_time
         FROM provider_working_hours
         WHERE provider_id = $1
         ORDER BY day_of_week`,
        [providerId]
      ),
      query(
        `SELECT id, starts_at, ends_at, reason
         FROM provider_absences
         WHERE provider_id = $1
           AND ends_at >= NOW() - INTERVAL '30 days'
         ORDER BY starts_at`,
        [providerId]
      )
    ]);

    res.json({ providerId, workingHours: hoursResult.rows, absences: absencesResult.rows });
  } catch (error) {
    next(error);
  }
});

providersRouter.put('/me/working-hours', authenticate, requireRole('provider'), async (req, res, next) => {
  try {
    const { workingHours = [] } = req.body;
    const providerResult = await query('SELECT id FROM providers WHERE user_id = $1', [req.user.sub]);
    if (providerResult.rowCount === 0) {
      return res.status(404).json({ error: 'Provider profile not found.' });
    }

    const providerId = providerResult.rows[0].id;
    await query('DELETE FROM provider_working_hours WHERE provider_id = $1', [providerId]);

    for (const hours of workingHours) {
      if (hours.enabled === false) continue;
      await query(
        `INSERT INTO provider_working_hours (provider_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3, $4)`,
        [providerId, hours.dayOfWeek, hours.startTime, hours.endTime]
      );
    }

    const result = await query(
      `SELECT id, day_of_week, start_time, end_time
       FROM provider_working_hours
       WHERE provider_id = $1
       ORDER BY day_of_week`,
      [providerId]
    );

    res.json({ workingHours: result.rows });
  } catch (error) {
    next(error);
  }
});

providersRouter.post('/me/absences', authenticate, requireRole('provider'), async (req, res, next) => {
  try {
    const { startsAt, endsAt, reason } = req.body;
    if (!startsAt || !endsAt) {
      return res.status(400).json({ error: 'Absence start and end are required.' });
    }

    const providerResult = await query('SELECT id FROM providers WHERE user_id = $1', [req.user.sub]);
    if (providerResult.rowCount === 0) {
      return res.status(404).json({ error: 'Provider profile not found.' });
    }

    const result = await query(
      `INSERT INTO provider_absences (provider_id, starts_at, ends_at, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING id, starts_at, ends_at, reason`,
      [providerResult.rows[0].id, new Date(startsAt), new Date(endsAt), reason || null]
    );

    res.status(201).json({ absence: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

providersRouter.delete('/me/absences/:id', authenticate, requireRole('provider'), async (req, res, next) => {
  try {
    const result = await query(
      `DELETE FROM provider_absences pa
       USING providers p
       WHERE pa.id = $1
         AND pa.provider_id = p.id
         AND p.user_id = $2
       RETURNING pa.id`,
      [req.params.id, req.user.sub]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Absence not found.' });
    }

    res.json({ absence: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
