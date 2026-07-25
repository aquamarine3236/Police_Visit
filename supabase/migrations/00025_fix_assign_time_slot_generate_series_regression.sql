-- Migration 00025: Fix fn_assign_time_slot — generate_series over TIME regression
--
-- Bug (production regression)
-- ---------------------------
-- Public registration failed again with:
--   "function generate_series(time without time zone, time without time zone,
--    interval) does not exist"
--
-- Root cause
-- ----------
-- `scheduling_settings.morning_start_time / morning_end_time /
-- afternoon_start_time / afternoon_end_time` are `TIME` columns (migration
-- 00006). PostgreSQL provides NO `generate_series(time, time, interval)`
-- overload — only integer/numeric, `timestamp`, and `timestamptz`.
--
-- Migration 00018 already fixed this by anchoring the TIME values onto a fixed
-- dummy DATE and iterating with generate_series over `timestamp`. However,
-- migration 00024 recreated `fn_assign_time_slot` (via CREATE OR REPLACE) using
-- the OLD, invalid raw-TIME pattern again — reintroducing the exact bug. Because
-- 00024 runs after 00018, the broken definition is the one live in production.
--
-- Fix
-- ---
-- Forward-only migration (we never edit an already-applied migration). Recreate
-- `fn_assign_time_slot` with the correct anchored-timestamp approach from 00018,
-- while preserving ALL behaviour introduced/kept by 00024:
--   * SECURITY DEFINER + fixed search_path
--   * advisory lock acquired FIRST (atomic limit + capacity check)
--   * monthly/total visit-limit check via the current fn_check_monthly_visit_limit
--   * capacity check against max_visit_per_time
-- The dummy anchor date never leaves the function; only the TIME part of each
-- slot (slot_start / slot_end) is returned, so behaviour is identical to intent.

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
      slots.slot_start::time                 AS slot_start,
      (slots.slot_start + v_interval)::time  AS slot_end
    FROM (
      -- Morning session: anchor TIME onto a dummy DATE so generate_series runs
      -- over `timestamp` (a supported overload), never over raw TIME.
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

-- Re-assert execution grants (function was recreated via CREATE OR REPLACE).
GRANT EXECUTE ON FUNCTION fn_assign_time_slot(UUID, DATE, UUID)
  TO anon, authenticated;
