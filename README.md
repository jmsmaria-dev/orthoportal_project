# OrthoSchedule

OrthoSchedule is a full-stack orthopedic appointment management system. It includes a React/Vite frontend, a Node/Express REST API backend, and a PostgreSQL database.

Users can register as patients or providers. Patients can browse orthopedic providers, view availability, book appointments, and cancel appointments. Providers can log in and view booked patient appointments on a calendar. Patients receive an automated email reminder 24 hours before their appointment.

## Repository

```text
https://github.com/jmsmaria-dev/orthoportal_project
```

## Tech Stack

- Frontend: React, Vite, React Icons
- Backend: Node.js, Express
- Database: PostgreSQL
- Authentication: JWT
- Email reminders: Nodemailer + Resend SMTP
- Reminder scheduling: GitHub Actions (cron, every 5 minutes)
- Local database: Docker Compose with PostgreSQL

## Prerequisites

Install these before running the project:

- Git
- Node.js 18 or newer
- npm
- Docker Desktop

Make sure Docker Desktop is running before starting PostgreSQL.

## Clone The Project

```
git clone https://github.com/jmsmaria-dev/orthoportal_project.git
cd orthoportal_project
```

If you already cloned the project, update it with:

```
git pull origin main
```

## Project Structure

```
orthoportal_project/
  .github/
    workflows/
      reminders.yml         GitHub Actions cron job for email reminders
  backend/              Node/Express API
  frontend/             React/Vite app
  docker-compose.yml    Local PostgreSQL container
  README.md             Setup and usage guide

```

## Start PostgreSQL

From the project root:

```
docker compose up -d postgres
```

Check that the container is running:

```
docker compose ps
```

The default local database connection is:

```
postgres://postgres:postgres@localhost:5432/orthoschedule

```

## Backend Setup

Open a terminal from the project root:

```
cd backend
npm install
Copy-Item .env.example .env
```

The default `.env` values are ready for the included Docker PostgreSQL database. If you use a different PostgreSQL instance, edit `backend/.env` and update `DATABASE_URL`.

Initialize and seed the database:

```
npm run db:init
npm run db:seed
```

Start the backend API:

```
npm run dev
```

The backend runs at:

```
http://localhost:4000/api

```

Health check:

```
http://localhost:4000/api/health

```

## Frontend Setup

Open a second terminal from the project root:

```
cd frontend
npm install
npm run dev
```

The frontend usually runs at:

```
http://127.0.0.1:5173

```

If Vite chooses another port, use the URL printed in the terminal.

The frontend calls this API by default:

```
http://localhost:4000/api

```

To use a different API URL, create `frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:4000/api
```

## Demo Accounts

After running `npm run db:seed`, use these accounts:

```
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

> **Note:** Demo accounts use `.test` email addresses and will not receive reminder emails. To test the reminder flow end to end, register a new patient account with a real email address and book an appointment for the following day.

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

```
cd backend
npm run dev
```

Run frontend:

```
cd frontend
npm run dev
```

Build frontend:

```
cd frontend
npm run build
```

Re-run database schema:

```
cd backend
npm run db:init
```

Re-seed demo data:

```
cd backend
npm run db:seed
```

Stop PostgreSQL container:

```
docker compose stop postgres
```

Stop and remove containers:

```
docker compose down
```

Stop and remove containers plus database volume:

```
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
- `GET /api/admin/users`
- `POST /api/admin/appointments/:id/reminder`
- `POST /api/admin/send-reminders`

Protected routes require a JWT bearer token. The `/api/admin/send-reminders` route is secured by a `CRON_SECRET` header instead of JWT and is intended for GitHub Actions only.

## Email Reminders

Patients automatically receive an email reminder 24 hours before their appointment. The reminder system works as follows:

1. A GitHub Actions workflow runs every 5 minutes and calls `POST /api/admin/send-reminders`
2. The endpoint is secured by a `CRON_SECRET` header - no JWT required for this route
3. The server queries for all booked appointments with `reminder_sent_at IS NULL` and `starts_at` between 23 and 24 hours from now
4. Each matching appointment triggers an email via Nodemailer using Resend SMTP
5. Successfully sent reminders are marked with `reminder_sent_at = NOW()` to prevent duplicates
6. If a patient reschedules, `reminder_sent_at` is reset to `NULL` so they receive a fresh reminder for the new time
7. Cancelled appointments are ignored - the query filters to `status = 'booked'` only

### Resend Setup

1. Sign up at https://resend.com (free, no credit card required)
2. Go to **Domains** to **Add Domain** to enter your domain
3. Add the DNS records Resend provides into Cloudflare DNS - set all records to **DNS only** (grey cloud, not orange)
4. Click **Verify DNS Records** in Resend
5. Go to **API Keys** to **Create API Key** to copy the key (shown once only)
6. Use the key as `SMTP_PASS` in your environment variables

### GitHub Actions Setup

The workflow file is at `.github/workflows/reminders.yml` and runs automatically once merged to main. Two secrets must be added to the repository:

1. Go to the repo on GitHub to **Settings** to **Secrets and variables** to **Actions** to **New repository secret**
2. Add:
   - `CRON_SECRET` - must match the `CRON_SECRET` in your Render environment variables
   - `RENDER_APP_URL` - the base URL of your deployed app

### Render Environment Variables

In Render to your service to **Environment**, add:

| Variable | Value |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | your Resend API key |
| `EMAIL_FROM` | `OrthoSchedule <no-reply@yourdomain.com>` |
| `CRON_SECRET` | same value as GitHub Actions secret |
| `REMINDERS_ENABLED` | `false` |

### Verifying Reminders Are Working

1. Go to the repo to **Actions** tab - the workflow should run every 5 minutes
2. Click into a run and check the logs for a successful HTTP response
3. Register a patient account with a real email address on the live site
4. Book an appointment for tomorrow
5. Check the Resend dashboard to **Emails** to **Logs** to confirm delivery
6. Check your inbox for the reminder email

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

If reminder emails are not sending:

- Check the GitHub Actions tab to confirm the workflow is running.
- Confirm `CRON_SECRET` matches between GitHub Actions secrets and Render environment variables.
- Check the Resend dashboard to **Emails** to **Logs** for delivery status.
- Confirm the patient account was registered with a real email address (`.test` addresses are blocked).
- Confirm the appointment `starts_at` falls within the 23–24 hour window from now.

## Changelog

### v0.2.0
- Added automated 24-hour appointment email reminders via Nodemailer and Resend SMTP
- Added GitHub Actions workflow to trigger reminder job every 5 minutes
- Added `POST /api/admin/send-reminders` endpoint secured by `CRON_SECRET`
- Replaced basic regex email validation with RFC 5322 compliant validation via `email-validator`
- Fixed: `reminder_sent_at` now resets to `NULL` when a patient reschedules
- Removed internal `node-cron` job in favor of GitHub Actions scheduling

### v0.1.0
- Initial release: patient/provider/admin roles, appointment booking, JWT authentication, provider availability, Docker PostgreSQL

## Notes

- `.env`, `node_modules`, build output, and runtime logs are ignored by git.
- Reminder emails are disabled locally by default with `REMINDERS_ENABLED=false` - GitHub Actions handles scheduling in production.
- Demo seed accounts use `.test` addresses and will never receive reminder emails by design.
- The Render free tier allows 750 hours per month - sufficient for the current deployment window.
