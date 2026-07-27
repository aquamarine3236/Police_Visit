-- ============================================================================
-- 40_timezone — Standardize the database session timezone to UTC+7
-- ============================================================================
-- Source (merged): 00017_set_timezone.sql
--
-- (The realtime publication + REPLICA IDENTITY for visit_registrations — from
--  migration 00016 — lives in 04_visit_registrations.sql, next to that table.)
--
-- Business rule: the ONLY business timezone is UTC+7 (Asia/Ho_Chi_Minh).
-- TIMESTAMPTZ storage (absolute instant) is unaffected; this pins the session
-- TimeZone GUC so any server-side date derivation (now()::date, CURRENT_DATE,
-- to_char(...)) is consistent with Vietnam local time.

-- ─── 1. Database default ─────────────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Ho_Chi_Minh');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping ALTER DATABASE timezone (insufficient privilege); relying on role-level setting.';
END;
$$;

-- ─── 2. API / auth roles ─────────────────────────────────────────────────────
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
SET timezone TO 'Asia/Ho_Chi_Minh';
