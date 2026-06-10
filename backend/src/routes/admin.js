import express from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export const adminRouter = express.Router();

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
