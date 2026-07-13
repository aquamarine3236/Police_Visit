-- Migration 00016: Enable Supabase Realtime for the admin dashboard (fixes H1)
--
-- The admin dashboard subscribes to INSERT/UPDATE events on
-- `visit_registrations` (Phase 33) to live-append new registrations and reflect
-- status changes. For those `postgres_changes` events to be broadcast, the
-- table must be part of the `supabase_realtime` publication and expose enough
-- of the old row for UPDATE payloads (REPLICA IDENTITY FULL).

-- Add the table to the realtime publication (idempotent guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'visit_registrations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.visit_registrations;
  END IF;
END;
$$;

-- Ensure UPDATE events carry the full previous row so the client can react to
-- status transitions reliably.
ALTER TABLE public.visit_registrations REPLICA IDENTITY FULL;
