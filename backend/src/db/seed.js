import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './pool.js';

const users = [
  ['Jane Doe', 'patient@ortho.test', 'patient', 'patient123'],
  ['Dr. Michael Anderson', 'anderson@ortho.test', 'provider', 'provider123'],
  ['Dr. Sarah Mitchell', 'mitchell@ortho.test', 'provider', 'provider123'],
  ['Dr. David Lee', 'lee@ortho.test', 'provider', 'provider123'],
  ['Dr. Emily Carter', 'carter@ortho.test', 'provider', 'provider123'],
  ['Admin User', 'admin@ortho.test', 'administrator', 'admin123']
];

const providerProfiles = [
  ['anderson@ortho.test', 'Knee & Sports Medicine', 'OrthoCare Clinic', 4.9, 128],
  ['mitchell@ortho.test', 'Spine Specialist', 'Spine Health Center', 4.8, 96],
  ['lee@ortho.test', 'Shoulder & Elbow Specialist', 'Peak Orthopedics', 4.7, 88],
  ['carter@ortho.test', 'Foot & Ankle Specialist', 'Precision Ortho', 4.9, 120]
];

await withTransaction(async (client) => {
  for (const [name, email, role, password] of users) {
    const passwordHash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO users (name, email, role, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [name, email, role, passwordHash]
    );
  }

  for (const [email, specialty, location, rating, reviews] of providerProfiles) {
    const userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    const userId = userResult.rows[0].id;

    const providerResult = await client.query(
      `INSERT INTO providers (user_id, specialty, location, rating, reviews)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
       SET specialty = EXCLUDED.specialty,
           location = EXCLUDED.location,
           rating = EXCLUDED.rating,
           reviews = EXCLUDED.reviews
       RETURNING id`,
      [userId, specialty, location, rating, reviews]
    );

    const providerId = providerResult.rows[0].id;
    for (const dayOfWeek of [1, 2, 3, 4, 5]) {
      await client.query(
        `INSERT INTO provider_working_hours (provider_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, '08:00', '16:30')
         ON CONFLICT (provider_id, day_of_week) DO NOTHING`,
        [providerId, dayOfWeek]
      );
    }
  }

  const patientResult = await client.query('SELECT id FROM users WHERE email = $1', ['patient@ortho.test']);
  const providerResult = await client.query(
    `SELECT p.id
     FROM providers p
     JOIN users u ON u.id = p.user_id
     WHERE u.email = $1`,
    ['anderson@ortho.test']
  );

  const appointmentDate = new Date();
  appointmentDate.setDate(appointmentDate.getDate() + 1);
  while ([0, 6].includes(appointmentDate.getDay())) {
    appointmentDate.setDate(appointmentDate.getDate() + 1);
  }
  appointmentDate.setHours(10, 0, 0, 0);
  const appointmentEnd = new Date(appointmentDate.getTime() + 30 * 60 * 1000);

  const existingAppointment = await client.query(
    `SELECT id
     FROM appointments
     WHERE patient_id = $1
       AND provider_id = $2
       AND starts_at = $3
       AND status = 'booked'`,
    [patientResult.rows[0].id, providerResult.rows[0].id, appointmentDate]
  );

  if (existingAppointment.rowCount === 0) {
    await client.query(
      `INSERT INTO appointments (patient_id, provider_id, starts_at, ends_at, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ON CONSTRAINT appointments_no_provider_overlap DO NOTHING`,
      [
        patientResult.rows[0].id,
        providerResult.rows[0].id,
        appointmentDate,
        appointmentEnd,
        'Follow-up knee consultation'
      ]
    );
  }
});

await pool.end();
console.log('Database seeded with demo users and providers.');
