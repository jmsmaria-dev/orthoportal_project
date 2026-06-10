import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';

export const profileRouter = express.Router();

profileRouter.use(authenticate);

profileRouter.get('/', async (req, res, next) => {
  try {
    const userResult = await query(
      `SELECT id, name, email, role, phone
       FROM users
       WHERE id = $1`,
      [req.user.sub]
    );

    const profile = { user: userResult.rows[0], provider: null };

    if (req.user.role === 'provider') {
      const providerResult = await query(
        `SELECT id, specialty, location, bio, education, years_experience,
                rating, reviews, appointment_duration_minutes, buffer_minutes
         FROM providers
         WHERE user_id = $1`,
        [req.user.sub]
      );
      profile.provider = providerResult.rows[0] || null;
    }

    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

profileRouter.patch('/', async (req, res, next) => {
  try {
    const { name, phone, specialty, location, bio, education, yearsExperience } = req.body;

    const userResult = await query(
      `UPDATE users
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone)
       WHERE id = $3
       RETURNING id, name, email, role, phone`,
      [name || null, phone || null, req.user.sub]
    );

    let provider = null;
    if (req.user.role === 'provider') {
      const providerResult = await query(
        `UPDATE providers
         SET specialty = COALESCE($1, specialty),
             location = COALESCE($2, location),
             bio = COALESCE($3, bio),
             education = COALESCE($4, education),
             years_experience = COALESCE($5, years_experience)
         WHERE user_id = $6
         RETURNING id, specialty, location, bio, education, years_experience,
                   rating, reviews, appointment_duration_minutes, buffer_minutes`,
        [specialty || null, location || null, bio || null, education || null, yearsExperience ?? null, req.user.sub]
      );
      provider = providerResult.rows[0] || null;
    }

    res.json({ profile: { user: userResult.rows[0], provider } });
  } catch (error) {
    next(error);
  }
});
