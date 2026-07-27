-- ============================================================================
-- 04_visit_registrations — Visit registrations — FINAL consolidated schema
-- ============================================================================
-- Sources (merged):
--   00004_create_visit_registrations.sql          (base table + indexes)
--   00019_prevent_duplicate_inmate_visit_per_day.sql (unique active per day)
--   00016_enable_realtime.sql                      (realtime publication +
--                                                   REPLICA IDENTITY FULL)
--
-- Final state notes:
--   * uq_vr_inmate_visit_date_active enforces at most ONE active registration
--     per (inmate_id, visit_date). "Active" = confirmed/completed/no_show.
--   * REPLICA IDENTITY FULL so Supabase Realtime UPDATE payloads carry the
--     previous row (admin dashboard live updates).
--   * The one-time historical dedup DELETE from migration 00019 is intentionally
--     omitted here — a fresh schema has no pre-existing duplicates to clean up.

CREATE TABLE IF NOT EXISTS visit_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prison_id UUID NOT NULL REFERENCES prisons(id) ON DELETE CASCADE,
  inmate_id UUID NOT NULL REFERENCES inmates(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  time_slot_start TIME NOT NULL,
  time_slot_end TIME NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  CONSTRAINT visit_registrations_status_check CHECK (status IN ('confirmed', 'completed', 'no_show')),
  CONSTRAINT visit_registrations_time_order_check CHECK (time_slot_start < time_slot_end)
);

CREATE INDEX IF NOT EXISTS idx_vr_scheduling ON visit_registrations(prison_id, visit_date, time_slot_start, status);
CREATE INDEX IF NOT EXISTS idx_vr_inmate_month ON visit_registrations(inmate_id, visit_date, status);
CREATE INDEX IF NOT EXISTS idx_vr_status ON visit_registrations(status);
CREATE INDEX IF NOT EXISTS idx_vr_created_at ON visit_registrations(created_at DESC);

-- At most one active registration per inmate per day (BR-06, DB-level guard).
CREATE UNIQUE INDEX IF NOT EXISTS uq_vr_inmate_visit_date_active
  ON visit_registrations (inmate_id, visit_date)
  WHERE status IN ('confirmed', 'completed', 'no_show');

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- Add the table to the supabase_realtime publication (idempotent guard) and
-- expose the full previous row for UPDATE payloads.
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

ALTER TABLE public.visit_registrations REPLICA IDENTITY FULL;
