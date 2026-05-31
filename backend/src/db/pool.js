import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

if (!config.databaseUrl) {
  console.warn('DATABASE_URL is not set. PostgreSQL-backed routes will fail until it is configured.');
}

export const pool = new Pool({
  connectionString: config.databaseUrl
});

export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result;
}

export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
