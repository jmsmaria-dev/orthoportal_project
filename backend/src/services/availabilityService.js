import { query } from '../db/pool.js';
import { addMinutes, dateWithTime, formatTime, overlaps } from '../utils/time.js';

export async function getAvailability(providerId, date) {
  const providerResult = await query(
    `SELECT appointment_duration_minutes, buffer_minutes
     FROM providers
     WHERE id = $1`,
    [providerId]
  );

  if (providerResult.rowCount === 0) {
    const error = new Error('Provider not found.');
    error.status = 404;
    throw error;
  }

  const requestedDate = new Date(`${date}T12:00:00`);
  const dayOfWeek = requestedDate.getDay();
  const hoursResult = await query(
    `SELECT start_time, end_time
     FROM provider_working_hours
     WHERE provider_id = $1 AND day_of_week = $2`,
    [providerId, dayOfWeek]
  );

  if (hoursResult.rowCount === 0) {
    return [];
  }

  const { appointment_duration_minutes: duration, buffer_minutes: buffer } = providerResult.rows[0];
  const { start_time: workStart, end_time: workEnd } = hoursResult.rows[0];
  const dayStart = dateWithTime(date, workStart.slice(0, 5));
  const dayEnd = dateWithTime(date, workEnd.slice(0, 5));

  const appointmentsResult = await query(
    `SELECT starts_at, ends_at
     FROM appointments
     WHERE provider_id = $1
       AND status = 'booked'
       AND starts_at >= $2
       AND starts_at < $3`,
    [providerId, dayStart, addMinutes(dayStart, 24 * 60)]
  );

  const absencesResult = await query(
    `SELECT starts_at, ends_at
     FROM provider_absences
     WHERE provider_id = $1
       AND starts_at < $3
       AND ends_at > $2`,
    [providerId, dayStart, addMinutes(dayStart, 24 * 60)]
  );

  const blocked = [
    ...appointmentsResult.rows.map((row) => ({
      start: new Date(row.starts_at),
      end: addMinutes(new Date(row.ends_at), buffer)
    })),
    ...absencesResult.rows.map((row) => ({
    start: new Date(row.starts_at),
      end: new Date(row.ends_at)
    }))
  ];

  const slots = [];
  for (let start = dayStart; addMinutes(start, duration) <= dayEnd; start = addMinutes(start, duration + buffer)) {
    const end = addMinutes(start, duration);
    const available = !blocked.some((block) => overlaps(start, end, block.start, block.end));
    if (available && start > new Date()) {
      slots.push({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        label: formatTime(start)
      });
    }
  }

  return slots;
}
