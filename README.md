# OrthoSchedule

This workspace contains a React/Vite frontend and Node/Express backend for the OrthoSchedule orthopedic appointment system.

## Frontend

Location: `frontend/`

### Install dependencies

Open a terminal in `frontend/` and run:

```powershell
npm install
```

### Run development server

```powershell
npm run dev
```

The frontend calls the backend at `http://localhost:4000/api` by default. To point it somewhere else, create `frontend/.env`:

```powershell
VITE_API_BASE_URL=http://localhost:4000/api
```

## Backend

Location: `backend/`

The backend implements:

- JWT authentication with patient, provider, and administrator roles.
- Provider listing and filtering.
- Provider availability calculation from working hours and booked appointments.
- Appointment booking, cancellation, and rescheduling endpoints.
- PostgreSQL double-booking protection using an exclusion constraint.
- Nodemailer and node-cron reminder job scaffolding for upcoming appointments.

### Install dependencies

Open a terminal in `backend/` and run:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `backend/.env` and set `DATABASE_URL` to your PostgreSQL database.

For local development with Docker, the included `docker-compose.yml` starts PostgreSQL with the same default `DATABASE_URL`:

```powershell
docker compose up -d postgres
```

### Initialize and seed PostgreSQL

```powershell
npm run db:init
npm run db:seed
```

Demo accounts created by the seed script:

- Patient: `patient@ortho.test` / `patient123`
- Provider: `anderson@ortho.test` / `provider123`
- Administrator: `admin@ortho.test` / `admin123`

The login screen also supports registering new patient or provider accounts. Provider registration creates a provider profile and weekday working hours automatically.

### Run development API server

```powershell
npm run dev
```

The API will run at `http://localhost:4000/api`.

### Core API routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/providers`
- `GET /api/providers/:id/availability?date=YYYY-MM-DD`
- `GET /api/appointments`
- `POST /api/appointments`
- `PATCH /api/appointments/:id`
- `DELETE /api/appointments/:id`

### Notes

- Creating based on a wireframe design
- Provider cards use icon placeholders instead of real photos.
- Backend API and PostgreSQL integration are implemented in `backend/`.
