import express from 'express';
import { query } from '../db/pool.js';
import { getAvailability } from '../services/availabilityService.js';

export const providersRouter = express.Router();

providersRouter.get('/', async (req, res, next) => {
  try {
    const { search = '' } = req.query;
    const result = await query(
      `SELECT p.id, u.name, p.specialty, p.location, p.rating, p.reviews
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
