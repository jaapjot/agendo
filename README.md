# Agendo

**Online appointment booking for independent professionals.** Professionals publish their services and working hours; clients book a free slot from a shareable link, then cancel or reschedule within the professional's rules. Two people can never book the same time, even if they click at the same instant.

![CI](https://github.com/OWNER/agendo/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/license-MIT-teal.svg)

![Public booking page](docs/screenshots/booking.png)

> 🇪🇸 **¿Hablás español?** Hay un [resumen en español](#-resumen-en-español) al final, y una [guía de aprendizaje completa](docs/GUIA-DE-APRENDIZAJE.md) que explica cada decisión del proyecto.

---

## Table of contents

1. [The problem](#the-problem)
2. [Features](#features)
3. [Tech stack](#tech-stack)
4. [Architecture](#architecture)
5. [Project structure](#project-structure)
6. [Getting started](#getting-started)
7. [Environment variables](#environment-variables)
8. [Running the project](#running-the-project)
9. [Testing](#testing)
10. [Screenshots](#screenshots)
11. [API reference](#api-reference)
12. [Engineering decisions](#engineering-decisions)
13. [Future improvements](#future-improvements)

---

## The problem

Hairdressers, physiotherapists, private tutors and other independent professionals typically coordinate appointments over WhatsApp. That means constant back-and-forth messages, double bookings, forgotten appointments and time spent on scheduling instead of working.

Agendo gives every professional a public booking page (`/p/your-business`) that only offers times that are actually free, computed from their weekly schedule, their time off and existing appointments.

**Target users:** independent professionals and their clients, on mobile and desktop. The interface is in Spanish (Argentina); the code and API are in English.

## Features

**For clients**

- Search professionals by name or service (search is kept in the URL, so results can be shared).
- Book in three steps: service → day → time, with availability shown in the professional's time zone.
- "My appointments": upcoming and past, with **cancel** and **reschedule** (allowed only before the professional's cancellation deadline).
- If someone takes the slot while you are deciding, you get a clear message and fresh availability.

**For professionals**

- Services CRUD (duration, price, active/inactive). Services with history cannot be deleted, only deactivated.
- Weekly schedule editor with **split shifts** (e.g. 09–13 and 15–19) and days off.
- **Time off** periods (holidays); the app warns if existing appointments fall inside them.
- Weekly agenda with attendance tracking (attended / no-show / cancel).
- Dashboard summary computed from real data: today, next 7 days, 30-day attendance rate.
- Booking rules: minimum notice, booking window, cancellation deadline, time zone and public link.
- Onboarding checklist until the profile is bookable (unbookable profiles are hidden from search).

**Cross-cutting**

- Register/login with two roles, persistent sessions with refresh-token rotation.
- Loading skeletons, empty states, error states with retry, toasts, field-level validation messages.
- Responsive from 360 px phones to desktop; accessible forms, dialogs and radio groups.

## Tech stack

| Layer        | Technology                                            | Why                                                                       |
| ------------ | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Frontend     | React 19, TypeScript, Vite                            | Industry-standard SPA stack with fast tooling                             |
| Styling      | Tailwind CSS 4                                        | Design tokens in one place, consistent spacing and colors                 |
| Server state | TanStack Query                                        | Caching, loading/error states and invalidation without hand-written state |
| Forms        | React Hook Form + Zod                                 | Typed schemas, field-level errors, minimal re-renders                     |
| Routing      | React Router 7                                        | Nested layouts, route guards, code-split routes                           |
| Backend      | Node.js 22, Express 5, TypeScript                     | Express 5 forwards async errors natively                                  |
| Database     | PostgreSQL 16 + Prisma 6                              | Relational integrity plus a type-safe client and versioned migrations     |
| Dates        | Luxon                                                 | Explicit IANA time zone handling on both ends                             |
| Auth         | JWT (access) + rotating opaque refresh tokens, bcrypt | Short-lived tokens with revocation support                                |
| Security     | Helmet, express-rate-limit, Zod validation            | Secure headers, brute-force protection, strict input checks               |
| Testing      | Vitest, Supertest, Testing Library, Playwright        | Unit, integration (real Postgres), component and end-to-end               |
| DevOps       | Docker, Docker Compose, GitHub Actions, Render        | One-command local run, CI on every push, one-click deploy                 |

## Architecture

```mermaid
flowchart LR
    subgraph Browser
        UI[React SPA<br/>TanStack Query]
    end
    subgraph Server["Node.js (one origin)"]
        Static[Static files<br/>built SPA]
        API[Express API<br/>/api/*]
        MW[Middleware<br/>helmet · auth · rate limit · errors]
        SVC[Services<br/>business rules]
        ENG[Slot engine<br/>pure function]
    end
    DB[(PostgreSQL<br/>exclusion constraint)]

    UI -- "HTTPS, JSON<br/>Bearer access token" --> MW --> API --> SVC --> DB
    SVC --> ENG
    UI -- "httpOnly refresh cookie<br/>/api/auth only" --> API
    Static --> UI
```

**Layers in the API.** Each feature lives in `src/modules/<feature>` with its routes (HTTP: parse input, call the service, send JSON) and, where the logic is non-trivial, a service (business rules, database access). Routes never contain business rules; services never touch `req`/`res`.

**The slot engine** (`modules/scheduling/slot-engine.ts`) is a pure function: given weekly rules, busy periods, "now" and the booking rules, it returns bookable start times. The same function powers both "show available times" and "validate this booking", so the UI and the server can never disagree.

**Double-booking protection is layered:**

1. The service checks the requested time against the slot engine (friendly `409 SLOT_UNAVAILABLE`).
2. Two simultaneous requests can both pass step 1. PostgreSQL then enforces an **exclusion constraint** (`EXCLUDE USING gist (professional_id WITH =, tstzrange(starts_at, ends_at) WITH &&)`) so the second `INSERT` fails, which the error handler maps to `409 SLOT_TAKEN`. An integration test fires 10 simultaneous bookings and asserts exactly one succeeds.

**Authentication flow.**

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as API
    participant D as DB
    B->>A: POST /api/auth/login
    A->>D: store SHA-256(refresh token), family id
    A-->>B: access token (JSON, kept in memory)<br/>+ refresh token (httpOnly cookie)
    B->>A: GET /api/me/... (Authorization: Bearer)
    Note over B,A: 15 minutes later the access token expires
    B->>A: POST /api/auth/refresh (cookie sent automatically)
    A->>D: revoke old token, issue new one in same family
    A-->>B: new access token + new cookie
    Note over A,D: an already-used token presented again → whole family revoked
```

**Deployment shape.** In production the Express server also serves the built React app, so frontend and API share one origin: no CORS configuration, and the refresh cookie can be `SameSite=Strict`. In development, Vite proxies `/api` to Express to reproduce the same setup.

## Project structure

```
agendo/
├── apps/
│   ├── api/                        # Express + Prisma backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # data model
│   │   │   ├── migrations/         # versioned SQL (incl. exclusion & CHECK constraints)
│   │   │   └── seed.ts             # demo data
│   │   ├── src/
│   │   │   ├── config/env.ts       # validated environment variables
│   │   │   ├── lib/                # prisma client, errors, tokens, logger, shared schemas
│   │   │   ├── middleware/         # authenticate, requireRole, error handler
│   │   │   ├── modules/
│   │   │   │   ├── auth/           # register, login, refresh rotation, logout
│   │   │   │   ├── scheduling/     # pure slot engine
│   │   │   │   ├── appointments/   # booking lifecycle, agenda, summary
│   │   │   │   ├── professionals/  # public directory, profile, slots
│   │   │   │   ├── services/  availability/  profile/
│   │   │   ├── app.ts              # builds the Express app (used by server and tests)
│   │   │   └── server.ts           # starts HTTP server, graceful shutdown
│   │   └── test/                   # unit + integration tests
│   └── web/                        # React frontend
│       └── src/
│           ├── auth/               # session context, route guard
│           ├── components/ui/      # design system: Button, Field, Modal, Badge, states
│           ├── components/         # SlotPicker, layouts
│           ├── lib/                # API client, formatting, query client
│           ├── pages/              # public pages + dashboard/
│           └── test/               # component and unit tests
├── e2e/                            # Playwright end-to-end tests
├── docs/                           # learning guide, deployment, screenshots
├── Dockerfile · docker-compose.yml · render.yaml
└── .github/workflows/ci.yml
```

## Getting started

### Prerequisites

- **Node.js 22+** and npm
- **PostgreSQL 14+** running locally, _or_ Docker

### Option A — Docker (fastest)

```bash
docker compose up --build
```

Open <http://localhost:4000>. To load the demo accounts, run the seed from your machine against the Compose database (exposed on port 5433):

```bash
npm install
DATABASE_URL=postgresql://agendo:agendo@localhost:5433/agendo npx tsx apps/api/prisma/seed.ts
```

### Option B — Local development

```bash
git clone https://github.com/OWNER/agendo.git
cd agendo
npm install

# 1. Configure the API
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env: set DATABASE_URL and a random JWT_ACCESS_SECRET (see below)

# 2. Create the database schema and demo data
createdb agendo            # or create it with any PostgreSQL client
npm run db:migrate --workspace=apps/api
npm run db:seed --workspace=apps/api
```

## Environment variables

`apps/api/.env` (see [`apps/api/.env.example`](apps/api/.env.example)):

| Variable                   | Required | Default         | Description                                                  |
| -------------------------- | -------- | --------------- | ------------------------------------------------------------ |
| `DATABASE_URL`             | ✅       | —               | PostgreSQL connection string                                 |
| `JWT_ACCESS_SECRET`        | ✅       | —               | Secret for signing access tokens, **at least 32 characters** |
| `NODE_ENV`                 |          | `development`   | `development`, `test` or `production`                        |
| `PORT`                     |          | `4000`          | HTTP port of the API                                         |
| `ACCESS_TOKEN_TTL_MINUTES` |          | `15`            | Access token lifetime                                        |
| `REFRESH_TOKEN_TTL_DAYS`   |          | `7`             | Session lifetime without activity                            |
| `TEST_DATABASE_URL`        |          | `…/agendo_test` | Database used by integration tests (it is wiped)             |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`apps/web/.env` is optional: `VITE_REPO_URL` shows a "source code" link in the footer.

The API validates its configuration at startup and exits with a clear message if something is missing.

## Running the project

```bash
npm run dev          # API on :4000 and web on :5173 (open http://localhost:5173)
npm run build        # production build of both apps
NODE_ENV=production npm start   # serve API + built frontend on :4000
```

`npm run dev` reads `apps/api/.env`; `npm start` (production) reads real environment variables, as hosting platforms provide them.

**Demo accounts** (after `db:seed`, password `demo1234`):

| Role         | Email                         |
| ------------ | ----------------------------- |
| Professional | `profesional@demo.agendo.app` |
| Client       | `cliente@demo.agendo.app`     |

Public demo page: <http://localhost:5173/p/estudio-demo>

## Testing

```bash
createdb agendo_test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agendo_test npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

npm test             # unit + integration (API) and component tests (web)
npm run test:e2e     # Playwright, starts both servers automatically
npm run lint
npm run typecheck
```

| Suite                                 | Tool                                 | What it covers                                                                                                        |
| ------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Slot engine (16 tests)                | Vitest                               | Split shifts, overlaps, notice, booking window, past times, DST changes                                               |
| API integration (46 tests)            | Vitest + Supertest + real PostgreSQL | Auth, token rotation and theft detection, permissions, booking rules, **10 concurrent bookings → exactly 1 succeeds** |
| Web (7 tests)                         | Vitest + Testing Library             | Price/time formatting across time zones, slot picker behaviour                                                        |
| End-to-end (3 journeys × 2 viewports) | Playwright                           | Full onboarding → booking → reschedule → cancel, auth errors, guards                                                  |

CI runs all of the above plus a Docker build on every push ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Screenshots

|                                                                                       |                                                                                  |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| ![Landing](docs/screenshots/landing.png) **Landing**                                  | ![Booking](docs/screenshots/booking.png) **Booking: service, day, time**         |
| ![Dashboard](docs/screenshots/dashboard-agenda.png) **Professional agenda and stats** | ![Schedule](docs/screenshots/schedule.png) **Weekly schedule with split shifts** |
| ![Services](docs/screenshots/services.png) **Services**                               | ![Validation](docs/screenshots/form-validation.png) **Field-level validation**   |

<p>
  <img src="docs/screenshots/mobile-booking.png" alt="Mobile booking" width="260">
  <img src="docs/screenshots/mobile-my-appointments.png" alt="Mobile appointments" width="260">
</p>

## API reference

All responses are JSON. Errors share one shape: `{ "error": { "code": "SLOT_TAKEN", "message": "...", "details": [...] } }`.

| Method                  | Path                                            | Auth         | Description                                                  |
| ----------------------- | ----------------------------------------------- | ------------ | ------------------------------------------------------------ |
| `POST`                  | `/api/auth/register`                            | —            | Create account (`role`: `CLIENT` or `PROFESSIONAL`)          |
| `POST`                  | `/api/auth/login`                               | —            | Log in, sets refresh cookie                                  |
| `POST`                  | `/api/auth/refresh`                             | cookie       | Rotate refresh token, new access token (`204` if no session) |
| `POST`                  | `/api/auth/logout`                              | cookie       | Revoke session                                               |
| `GET`                   | `/api/auth/me`                                  | bearer       | Current user                                                 |
| `GET`                   | `/api/professionals?q=`                         | —            | Search bookable professionals                                |
| `GET`                   | `/api/professionals/:slug`                      | —            | Public profile and services                                  |
| `GET`                   | `/api/professionals/:slug/slots?serviceId&date` | —            | Free start times for a day                                   |
| `POST`                  | `/api/appointments`                             | client       | Book                                                         |
| `GET`                   | `/api/appointments/mine?scope=upcoming\|past`   | client       | Own appointments                                             |
| `POST`                  | `/api/appointments/:id/cancel`                  | client       | Cancel (before deadline)                                     |
| `POST`                  | `/api/appointments/:id/reschedule`              | client       | Move to another free slot                                    |
| `PATCH`                 | `/api/appointments/:id/status`                  | professional | `COMPLETED`, `NO_SHOW` or `CANCELLED`                        |
| `GET`                   | `/api/me/agenda?from&to`                        | professional | Appointments in a date range (max 62 days)                   |
| `GET`                   | `/api/me/summary`                               | professional | Dashboard numbers                                            |
| `GET/PATCH`             | `/api/me/profile`                               | professional | Profile and booking rules                                    |
| `GET/POST/PATCH/DELETE` | `/api/me/services[/:id]`                        | professional | Services CRUD                                                |
| `GET/PUT`               | `/api/me/availability`                          | professional | Weekly schedule (replaced atomically)                        |
| `GET/POST/DELETE`       | `/api/me/time-off[/:id]`                        | professional | Time off                                                     |
| `GET`                   | `/api/health`                                   | —            | Liveness + database check                                    |

## Engineering decisions

- **Times are stored in UTC; schedules as local wall-clock minutes.** "Mondays 9:00–13:00" is a rule in the professional's time zone, not an instant. Slots are generated in that zone (correct across daylight-saving changes) and stored as UTC instants.
- **Money as integer cents**, and the price is **snapshotted** on each appointment, so a later price change never rewrites history.
- **Access token in memory, refresh token in an httpOnly cookie.** JavaScript can never read the long-lived credential. A single-flight refresh avoids parallel 401s triggering token-reuse detection.
- **Ownership checks return 404, not 403**, so ids of other users' resources cannot be probed.
- **Database constraints back up application rules** (exclusion constraint, `CHECK`s on ranges, prices and durations). The application gives friendly errors; the database guarantees integrity.
- **Express app factory (`createApp`)** separated from `server.ts`, so tests run the real app in-process without opening a port.
- **Stable library majors** (TypeScript 5.9, Vite 7, Prisma 6, React Router 7) chosen over just-released majors.

## Future improvements

- Email notifications and reminders (e.g. a queue + transactional email provider).
- Password reset and email verification.
- Scheduled cleanup of expired/revoked refresh tokens.
- Redis-backed rate limiting for multi-instance deployments.
- Per-service buffers between appointments and per-day booking limits.
- Calendar export (iCal) and Google Calendar sync.
- Payments/deposits to reduce no-shows.
- Accessibility audit with axe in the e2e suite.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for step-by-step instructions (Render blueprint included, Docker image works on any container host).

## License

[MIT](LICENSE)

---

## 🇪🇸 Resumen en español

**Agendo** es una aplicación full stack de turnos online para profesionales independientes (peluquerías, kinesiólogos, profesores particulares). El profesional carga sus servicios y horarios, y comparte un link. Sus clientes reservan solos un horario libre, y lo cancelan o reprograman según las reglas del profesional.

**Lo técnicamente destacable:**

- **Imposible reservar dos turnos superpuestos**, incluso con clics simultáneos: lo garantiza una _exclusion constraint_ de PostgreSQL. Un test lanza 10 reservas al mismo tiempo y verifica que solo una se concreta.
- **Motor de disponibilidad** como función pura, testeado con 16 casos (turnos partidos, anticipación mínima, cambio de horario de verano).
- **Autenticación segura**: access token en memoria, refresh token en cookie httpOnly con rotación y detección de robo.
- **Calidad**: 69 tests automatizados más tests E2E con Playwright, CI en GitHub Actions y Docker.

**Stack:** React + TypeScript, Tailwind, TanStack Query, Node.js + Express, PostgreSQL + Prisma, Docker y GitHub Actions.

👉 Para entender cómo está construido todo, leé la **[Guía de aprendizaje](docs/GUIA-DE-APRENDIZAJE.md)**.
