-- Migration 00017: Standardize the database session timezone to UTC+7
--
-- Business rule: the ONLY business timezone in the system is UTC+7
-- (Asia/Ho_Chi_Minh). See docs/08-scheduling-algorithm.md and src/lib/time.ts.
--
-- Why this matters
-- ----------------
-- `TIMESTAMPTZ` columns always store an absolute instant (UTC internally) — that
-- is correct and unchanged. The risk is any SQL that *derives a date* from the
-- clock, e.g. `now()::date`, `CURRENT_DATE`, or `to_char(created_at, ...)`.
-- Those depend on the session `TimeZone` GUC. On a fresh Postgres / Supabase
-- instance the default is often UTC, which would shift the calendar day by up
-- to 7 hours versus Vietnam local time (off-by-one before 07:00 local).
--
-- Fix strategy
-- ------------
-- Pin the timezone at the database level AND on the API roles Supabase uses, so
-- every connection (PostgREST/anon/authenticated, and the auth `authenticator`
-- login role) evaluates date/time expressions in UTC+7 by default.
--
-- Note: the application layer already passes DATE-only values and computes
-- "today"/day-of-week in UTC+7 (src/lib/time.ts), so this migration is a
-- defense-in-depth guard that keeps any *future* server-side SQL consistent. It
-- does NOT change how existing `timestamptz` data is stored.

-- ─── 1. Database default ─────────────────────────────────────────────────────
-- Applies to new sessions on this database. Wrapped so it is safe to run in
-- environments where the current role lacks ALTER DATABASE (best-effort).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Ho_Chi_Minh');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping ALTER DATABASE timezone (insufficient privilege); relying on role-level setting.';
END;
$$;

-- ─── 2. API / auth roles ─────────────────────────────────────────────────────
-- Supabase connects through these roles; pin the timezone per-role so it wins
-- even if the database default cannot be changed.
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER ROLE %I SET timezone TO %L', r, 'Asia/Ho_Chi_Minh');
    END IF;
  END LOOP;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping ALTER ROLE timezone (insufficient privilege).';
END;
$$;

-- ─── 3. Current session ──────────────────────────────────────────────────────
-- Ensure this very migration session (and anything run right after) is aligned.
SET timezone TO 'Asia/Ho_Chi_Minh';
