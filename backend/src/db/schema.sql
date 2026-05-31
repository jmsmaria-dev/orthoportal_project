CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('patient', 'provider', 'administrator');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('booked', 'cancelled', 'completed', 'rescheduled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS providers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  location TEXT NOT NULL,
  rating NUMERIC(2,1) NOT NULL DEFAULT 4.8,
  reviews INTEGER NOT NULL DEFAULT 0,
  appointment_duration_minutes INTEGER NOT NULL DEFAULT 30,
  buffer_minutes INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS provider_working_hours (
  id BIGSERIAL PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  UNIQUE (provider_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id BIGINT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status appointment_status NOT NULL DEFAULT 'booked',
  reason TEXT,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(provider_id, starts_at);

DO $$ BEGIN
  ALTER TABLE appointments
    ADD CONSTRAINT appointments_no_provider_overlap
    EXCLUDE USING gist (
      provider_id WITH =,
      tstzrange(starts_at, ends_at, '[)') WITH &&
    )
    WHERE (status = 'booked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
