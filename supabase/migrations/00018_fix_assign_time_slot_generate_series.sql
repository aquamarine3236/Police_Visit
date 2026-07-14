-- Migration 00018: Fix fn_assign_time_slot — generate_series over TIME is invalid
--
-- Bug
-- ---
-- Public registration failed with:
--   "function generate_series(time without time zone, time without time zone,
--    interval) does not exist"
--
-- Postgres does NOT provide a generate_series() overload for the `time` type
-- (only numeric, `timestamp`, and `timestamptz`). The slot-generation query in
-- migrations 00010/00015 called generate_series() directly on the TIME columns
-- (`morning_start_time`, etc.), which never resolves to a valid function.
--
-- Fix
-- ---
-- Anchor the TIME values onto a fixed dummy DATE so we can iterate with
-- generate_series over `timestamp`, then cast each step back to `time`. The
-- anchor date is arbitrary and never leaves the function — only the TIME part
-- (`slot_start` / `slot_end`) is returned, so behaviour is identical to the
-- intended logic. All other properties (SECURITY DEFINER, advisory lock ordering,
-- monthly-limit check, capacity check) are preserved from migration 00015.

CREATE OR REPLACE FUNCTION fn_assign_time_slot(
  p_prison_id UUID,
  p_visit_date DATE,
  p_inmate_id UUID
)
RETURNS TABLE(slot_start TIME, slot_end TIME)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings RECORD;
  slot_counts RECORD;
  slot_record RECORD;
  v_anchor CONSTANT DATE := DATE '2000-01-01';
  v_interval INTERVAL;
BEGIN
  SELECT * INTO settings
  FROM scheduling_settings
  WHERE prison_id = p_prison_id;

  IF settings IS NULL THEN
    RETURN;
  END IF;

  v_interval := make_interval(mins => settings.visit_time);

  -- Acquire the per-(prison, date) advisory lock FIRST so the limit check and
  -- capacity check are evaluated atomically with respect to concurrent inserts.
  PERFORM pg_advisory_xact_lock(hashtext(p_prison_id::text || p_visit_date::text));

  IF NOT fn_check_monthly_visit_limit(p_inmate_id, p_visit_date) THEN
    RETURN;
  END IF;

  FOR slot_record IN
    SELECT
      slots.slot_start::time            AS slot_start,
      (slots.slot_start + v_interval)::time AS slot_end
    FROM (
      -- Morning session
      SELECT generate_series(
        v_anchor + settings.morning_start_time,
        v_anchor + settings.morning_end_time - v_interval,
        v_interval
      ) AS slot_start
      UNION ALL
      -- Afternoon session
      SELECT generate_series(
        v_anchor + settings.afternoon_start_time,
        v_anchor + settings.afternoon_end_time - v_interval,
        v_interval
      ) AS slot_start
    ) AS slots
    ORDER BY slots.slot_start
  LOOP
    SELECT COUNT(*) AS count INTO slot_counts
    FROM visit_registrations
    WHERE prison_id = p_prison_id
      AND visit_date = p_visit_date
      AND time_slot_start = slot_record.slot_start
      AND status IN ('confirmed', 'completed', 'no_show');

    IF slot_counts.count < settings.max_visit_per_time THEN
      slot_start := slot_record.slot_start;
      slot_end := slot_record.slot_end;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END;
$$;
