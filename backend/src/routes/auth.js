import bcrypt from 'bcryptjs';
import express from 'express';
import { query, withTransaction } from '../db/pool.js';
import { authenticate, signToken } from '../middleware/auth.js';

export const authRouter = express.Router();

authRouter.post('/register', async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      role = 'patient',
      specialty = 'General Orthopedics',
      location = 'OrthoSchedule Clinic'
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (!['patient', 'provider'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, role`,
        [name, email.toLowerCase(), passwordHash, role]
      );

      const newUser = result.rows[0];

      if (role === 'provider') {
        const providerResult = await client.query(
          `INSERT INTO providers (user_id, specialty, location)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [newUser.id, specialty, location]
        );

        for (const dayOfWeek of [1, 2, 3, 4, 5]) {
          await client.query(
            `INSERT INTO provider_working_hours (provider_id, day_of_week, start_time, end_time)
             VALUES ($1, $2, '08:00', '16:30')`,
            [providerResult.rows[0].id, dayOfWeek]
          );
        }
      }

      return newUser;
    });

    res.status(201).json({ user, token: signToken(user) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    return next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
      [email?.toLowerCase()]
    );

    const user = result.rows[0];
    const isValid = user ? await bcrypt.compare(password || '', user.password_hash) : false;
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const publicUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ user: publicUser, token: signToken(publicUser) });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});
