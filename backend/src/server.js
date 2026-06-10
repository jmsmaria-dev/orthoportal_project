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
import { startReminderJob } from './services/reminderService.js';

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
  startReminderJob();
});
