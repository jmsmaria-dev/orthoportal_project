# OrthoSchedule

OrthoSchedule is a full-stack orthopedic appointment management system. It includes a React/Vite frontend, a Node/Express REST API backend, and a PostgreSQL database.

Users can register as patients or providers. Patients can browse orthopedic providers, view availability, book appointments, and cancel appointments. Providers can log in and view booked patient appointments on a calendar.

## Repository

```text
https://github.com/jmsmaria-dev/orthoportal_project
```

## Tech Stack

- Frontend: React, Vite, React Icons
- Backend: Node.js, Express
- Database: PostgreSQL
- Authentication: JWT
- Email reminders: Nodemailer and node-cron scaffolding
- Local database: Docker Compose with PostgreSQL

## Prerequisites

Install these before running the project:

- Git
- Node.js 18 or newer
- npm
- Docker Desktop

Make sure Docker Desktop is running before starting PostgreSQL.

## Clone The Project

```powershell
git clone https://github.com/jmsmaria-dev/orthoportal_project.git
cd orthoportal_project
```

If you already cloned the project, update it with:

```powershell
git pull origin main
```

## Project Structure

```text
orthoportal_project/
  backend/              Node/Express API
  frontend/             React/Vite app
  docker-compose.yml    Local PostgreSQL container
  README.md             Setup and usage guide
```

## Start PostgreSQL

From the project root:

```powershell
docker compose up -d postgres
```

Check that the container is running:

```powershell
docker compose ps
```

The default local database connection is:

```text
postgres://postgres:postgres@localhost:5432/orthoschedule
```

## Backend Setup

Open a terminal from the project root:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

The default `.env` values are ready for the included Docker PostgreSQL database. If you use a different PostgreSQL instance, edit `backend/.env` and update `DATABASE_URL`.

Initialize and seed the database:

```powershell
npm run db:init
npm run db:seed
```

Start the backend API:

```powershell
npm run dev
```

The backend runs at:

```text
http://localhost:4000/api
```

Health check:

```text
http://localhost:4000/api/health
```

## Frontend Setup

Open a second terminal from the project root:

```powershell
cd frontend
npm install
npm run dev
```

The frontend usually runs at:

```text
http://127.0.0.1:5173
```

If Vite chooses another port, use the URL printed in the terminal.

The frontend calls this API by default:

```text
http://localhost:4000/api
```

To use a different API URL, create `frontend/.env`:

```powershell
VITE_API_BASE_URL=http://localhost:4000/api
```

## Demo Accounts

After running `npm run db:seed`, use these accounts:

```text
Patient
Email: patient@ortho.test
Password: patient123

Provider
Email: anderson@ortho.test
Password: provider123

Administrator
Email: admin@ortho.test
Password: admin123
```

The login screen also has demo buttons for patient and provider login.

## Registering New Users

The app supports registering:

- Patient accounts
- Provider accounts

Provider registration automatically creates:

- Provider profile
- Specialty
- Clinic location
- Weekday working hours from 8:00 AM to 4:30 PM

## Common Development Commands

Run backend:

```powershell
cd backend
npm run dev
```

Run frontend:

```powershell
cd frontend
npm run dev
```

Build frontend:

```powershell
cd frontend
npm run build
```

Re-run database schema:

```powershell
cd backend
npm run db:init
```

Re-seed demo data:

```powershell
cd backend
npm run db:seed
```

Stop PostgreSQL container:

```powershell
docker compose stop postgres
```

Stop and remove containers:

```powershell
docker compose down
```

Stop and remove containers plus database volume:

```powershell
docker compose down -v
```

Use `docker compose down -v` only when you want to delete local database data.

## Core API Routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/providers`
- `GET /api/providers/:id/availability?date=YYYY-MM-DD`
- `GET /api/appointments`
- `POST /api/appointments`
- `PATCH /api/appointments/:id`
- `DELETE /api/appointments/:id`

Protected routes require a JWT bearer token.

## Troubleshooting

If the frontend cannot load providers:

- Make sure the backend is running on `http://localhost:4000`.
- Make sure PostgreSQL is running with `docker compose ps`.
- Make sure `backend/.env` exists.
- Re-run `npm run db:init` and `npm run db:seed`.

If Docker commands fail:

- Open Docker Desktop.
- Wait until Docker says it is running.
- Re-run `docker compose up -d postgres`.

If login fails:

- Confirm the database was seeded.
- Use one of the demo accounts above.
- Try refreshing the browser after restarting the backend.

If port `4000` or `5173` is already in use:

- Stop the process using that port, or let Vite choose another frontend port.
- If changing the backend port, update `PORT` in `backend/.env` and `VITE_API_BASE_URL` in `frontend/.env`.

## Notes

- `.env`, `node_modules`, build output, and runtime logs are ignored by git.
- Reminder emails are disabled locally by default with `REMINDERS_ENABLED=false`.
- To enable email reminders, configure SMTP values in `backend/.env`.
