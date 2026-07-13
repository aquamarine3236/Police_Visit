# Hệ thống Quản lý Đăng ký Thăm gặp (Prison Visit Scheduling Management System)

A web application for scheduling and managing prison visit registrations. Visitors
submit registrations through a public form and the system automatically assigns a
concurrency-safe time slot; administrators manage inmates, scheduling settings, and
registrations through a secured dashboard with realtime updates and document exports.

Built with **Next.js 15 (App Router)**, **TypeScript**, **TailwindCSS**, **shadcn/ui**,
and **Supabase** (PostgreSQL, Auth, Realtime).

---

## Features

- **Public registration** — 1–3 visitors per registration, dynamic Vietnamese
  guidance, date picker limited to configured suitable days, inline validation.
- **Automatic scheduling** — DB-level, advisory-lock-based slot assignment
  (`fn_assign_time_slot`) with monthly visit-limit enforcement.
- **Admin dashboard** — realtime registration list, status transitions, inmate
  CRUD, Excel import/export, PDF & Word slip generation, scheduling settings.
- **Security** — Supabase Auth (JWT + RLS), route middleware, rate limiting,
  hardened HTTP headers, and database-level audit logging.

---

## Tech Stack

| Layer       | Technology                                              |
| ----------- | ------------------------------------------------------- |
| Framework   | Next.js 15 (App Router, Server Actions, Route Handlers) |
| Language    | TypeScript (strict)                                     |
| Styling     | TailwindCSS + shadcn/ui                                 |
| Backend     | Supabase (PostgreSQL, Auth, Realtime)                   |
| Validation  | Zod                                                     |
| Docs/Export | exceljs, pdfmake, docx                                  |
| Testing     | Vitest (unit), Playwright (E2E)                         |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project (see the [Deployment Runbook](./docs/DEPLOYMENT_RUNBOOK.md))

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env.local
# then fill in the Supabase values in .env.local

# 3. Apply database migrations (requires the Supabase CLI)
npm install -g supabase
supabase link --project-ref <project-ref>
supabase db push

# 4. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the public form and
[http://localhost:3000/admin](http://localhost:3000/admin) for the admin dashboard.

### Environment variables

See [`.env.example`](./.env.example). Required:

| Variable                        | Exposure    |
| ------------------------------- | ----------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Client      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server only |
| `SUPABASE_DB_URL`               | Server only |
| `NEXT_PUBLIC_APP_URL`           | Client      |

---

## Scripts

| Command                 | Description                            |
| ----------------------- | -------------------------------------- |
| `npm run dev`           | Start the dev server                   |
| `npm run build`         | Production build                       |
| `npm start`             | Run the production build               |
| `npm run lint`          | ESLint                                 |
| `npm run type-check`    | TypeScript type check (`tsc --noEmit`) |
| `npm test`              | Unit tests (Vitest)                    |
| `npm run test:coverage` | Unit tests with coverage               |
| `npm run test:e2e`      | End-to-end tests (Playwright)          |

---

## Project Structure

```
src/
  app/            # App Router routes: (public), admin, api/v1
  actions/        # Server Actions
  components/     # layout, shared, and ui (shadcn) components
  hooks/          # React hooks
  lib/            # services, validations, supabase clients, helpers
  types/          # shared TypeScript + database types
supabase/
  migrations/     # ordered SQL migrations (00001-00013)
  seed.sql        # default prison + scheduling settings
  seed_admin.sql  # admin profile seed template
docs/             # architecture, design, and operational documentation
tests/            # unit (Vitest) and e2e (Playwright) tests
```

---

## Documentation

- [System Overview](./docs/01-system-overview.md)
- [Database Design](./docs/05-database-design.md)
- [Scheduling Algorithm](./docs/08-scheduling-algorithm.md)
- [Security](./docs/12-security.md)
- [Deployment Runbook](./docs/DEPLOYMENT_RUNBOOK.md)
- [Manual Verification](./docs/MANUAL_VERIFICATION.md)
- [Performance Notes](./docs/PERFORMANCE.md)

Full documentation index: [`docs/README.md`](./docs/README.md).

---

## Deployment

The application deploys to **Vercel** (frontend/serverless) + **Supabase**
(database/auth/realtime). Follow the step-by-step
[Deployment Runbook](./docs/DEPLOYMENT_RUNBOOK.md) and run through
[Manual Verification](./docs/MANUAL_VERIFICATION.md) before go-live.
