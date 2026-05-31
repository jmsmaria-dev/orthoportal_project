# OrthoSchedule Backend

Node/Express REST API for the orthopedic appointment scheduling system.

## Setup

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run db:init
npm run db:seed
npm run dev
```

Set `DATABASE_URL` in `.env` to your PostgreSQL database before running the database scripts.

## Demo Accounts

- Patient: `patient@ortho.test` / `patient123`
- Provider: `anderson@ortho.test` / `provider123`
- Administrator: `admin@ortho.test` / `admin123`

## API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/providers`
- `GET /api/providers/:id/availability?date=YYYY-MM-DD`
- `GET /api/appointments`
- `POST /api/appointments`
- `PATCH /api/appointments/:id`
- `DELETE /api/appointments/:id`
