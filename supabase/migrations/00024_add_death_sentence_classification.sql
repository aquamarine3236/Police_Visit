-- Migration 00024: Add "Người bị kết án tử hình" classification + visit limit overhaul
--
-- Changes:
-- 1. Expand the classification CHECK constraint to include the new value.
-- 2. Add `classification_changed_at` column to track when an inmate's
--    classification was last changed (used for visit-count reset logic).
-- 3. Backfill existing rows: set classification_changed_at = created_at so
--    existing visit history is preserved (backward-compatible).
-- 4. Rewrite `fn_check_monthly_visit_limit` to implement the new rules:
--      - "Người bị tạm giữ": max 2 visits TOTAL since classification_changed_at
--      - Others (tạm giam, kết án tử hình, phạm nhân): max 1 visit per month
-- 5. Recreate `fn_submit_registration` and `fn_assign_time_slot` unchanged
--    (they call fn_check_monthly_visit_limit internally).

-- ─── 1. Expand classification CHECK constraint ─────────────────────────────

ALTER TABLE inmates DROP CONSTRAINT IF EXISTS inmates_classification_check;

ALTER TABLE inmates ADD CONSTRAINT inmates_classification_check
  CHECK (classification IN (
    'Người bị tạm giữ',
    'Người bị tạm giam',
    'Người bị kết án tử hình',
    'Phạm nhân'
  ));

-- ─── 2. Add classification_changed_at column ────────────────────────────────

ALTER TABLE inmates
  ADD COLUMN IF NOT EXISTS classification_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─── 3. Backfill existing rows ──────────────────────────────────────────────
-- Set to created_at so existing inmates retain their visit history.

UPDATE inmates
SET classification_changed_at = created_at
WHERE classification_changed_at = (
  SELECT column_default::timestamptz
  FROM information_schema.columns
  WHERE table_name = 'inmates' AND column_name = 'classification_changed_at'
  LIMIT 1
) OR classification_changed_at >= now() - INTERVAL '1 second';

-- Simpler backfill: just update all rows where the column equals the default.
-- Since this migration runs once, we can safely update all rows.
UPDATE inmates SET classification_changed_at = created_at;

-- ─── 4. Rewrite fn_check_monthly_visit_limit ────────────────────────────────
-- New rules:
--   * "Người bị tạm giữ" → max 2 total visits since classification_changed_at
--   * Others → max 1 visit per calendar month

CREATE OR REPLACE FUNCTION fn_check_monthly_visit_limit(
  p_inmate_id UUID,
  p_visit_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH inmate_data AS (
  SELECT classification, classification_changed_at
  FROM inmates
  WHERE id = p_inmate_id
), counted_total AS (
  -- Count ALL visits since classification was changed (for "Người bị tạm giữ")
  SELECT COUNT(*) AS visit_count
  FROM visit_registrations vr, inmate_data id
  WHERE vr.inmate_id = p_inmate_id
    AND vr.visit_date >= id.classification_changed_at::date
    AND vr.status IN ('confirmed', 'completed', 'no_show')
), counted_monthly AS (
  -- Count visits in the same month as p_visit_date (for other classifications)
  SELECT COUNT(*) AS visit_count
  FROM visit_registrations vr
  WHERE vr.inmate_id = p_inmate_id
    AND vr.visit_date >= date_trunc('month', p_visit_date)::date
    AND vr.visit_date < (date_trunc('month', p_visit_date) + INTERVAL '1 month')::date
    AND vr.status IN ('confirmed', 'completed', 'no_show')
)
SELECT
  CASE
    WHEN inmate_data.classification = 'Người bị tạm giữ'
      THEN counted_total.visit_count < 2
    ELSE counted_monthly.visit_count < 1
  END
FROM inmate_data, counted_total, counted_monthly;
$$;

-- ─── 5. Recreate fn_assign_time_slot (unchanged, but depends on the above) ──
-- This function calls fn_check_monthly_visit_limit internally.
-- We recreate it to ensure it picks up the new function signature/behavior.

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
BEGIN
  SELECT * INTO settings
  FROM scheduling_settings
  WHERE prison_id = p_prison_id;

  IF settings IS NULL THEN
    RETURN;
  END IF;

  -- Acquire the per-(prison, date) advisory lock FIRST so the limit check and
  -- capacity check are evaluated atomically with respect to concurrent inserts.
  PERFORM pg_advisory_xact_lock(hashtext(p_prison_id::text || p_visit_date::text));

  IF NOT fn_check_monthly_visit_limit(p_inmate_id, p_visit_date) THEN
    RETURN;
  END IF;

  FOR slot_record IN
    SELECT slot_start, slot_end
    FROM (
      SELECT morning.slot_start
      FROM (
        SELECT generate_series(
          settings.morning_start_time,
          settings.morning_end_time - (settings.visit_time || ' minutes')::interval,
          (settings.visit_time || ' minutes')::interval
        ) AS slot_start
      ) AS morning
      UNION ALL
      SELECT afternoon.slot_start
      FROM (
        SELECT generate_series(
          settings.afternoon_start_time,
          settings.afternoon_end_time - (settings.visit_time || ' minutes')::interval,
          (settings.visit_time || ' minutes')::interval
        ) AS slot_start
      ) AS afternoon
    ) AS slots
    CROSS JOIN LATERAL (
      SELECT slots.slot_start + (settings.visit_time || ' minutes')::interval AS slot_end
    ) AS slot_end_calc
    ORDER BY slot_start
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

-- ─── 6. Recreate fn_submit_registration (preserve relative-check logic) ─────
-- Identical to migration 00022 except it now benefits from the updated
-- fn_check_monthly_visit_limit.

CREATE OR REPLACE FUNCTION fn_submit_registration(
  p_prison_id UUID,
  p_inmate_id UUID,
  p_visit_date DATE,
  p_visitors JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duplicate_count INTEGER;
  v_slot RECORD;
  v_registration visit_registrations%ROWTYPE;
  v_visitor JSONB;
  v_order INTEGER := 0;
  v_visitors JSONB := '[]'::jsonb;
  v_inserted registration_visitors%ROWTYPE;
  v_match_count INTEGER;
  v_invalid_positions INTEGER[] := ARRAY[]::INTEGER[];
BEGIN
  -- ─── Bước kiểm tra thân thích (mục 6) ─────────────────────────────────────
  v_order := 0;
  FOR v_visitor IN SELECT * FROM jsonb_array_elements(p_visitors)
  LOOP
    v_order := v_order + 1;

    SELECT COUNT(*) INTO v_match_count
    FROM inmate_relatives r
    WHERE r.inmate_id = p_inmate_id
      AND r.citizen_id = (v_visitor->>'citizen_id')
      AND lower(btrim(r.full_name)) = lower(btrim(v_visitor->>'full_name'));

    IF v_match_count = 0 THEN
      v_invalid_positions := array_append(v_invalid_positions, v_order);
    END IF;
  END LOOP;

  IF array_length(v_invalid_positions, 1) > 0 THEN
    RETURN jsonb_build_object(
      'error', 'NOT_RELATIVE',
      'positions', to_jsonb(v_invalid_positions)
    );
  END IF;

  -- ─── Duplicate prevention (BR-06) ─────────────────────────────────────────
  SELECT COUNT(*) INTO v_duplicate_count
  FROM visit_registrations vr
  WHERE vr.inmate_id = p_inmate_id
    AND vr.visit_date = p_visit_date
    AND vr.status IN ('confirmed', 'completed', 'no_show');

  IF v_duplicate_count > 0 THEN
    RETURN jsonb_build_object('error', 'DUPLICATE');
  END IF;

  -- Slot assignment (acquires advisory lock, checks monthly limit + capacity).
  SELECT * INTO v_slot
  FROM fn_assign_time_slot(p_prison_id, p_visit_date, p_inmate_id);

  IF v_slot IS NULL OR v_slot.slot_start IS NULL THEN
    IF NOT fn_check_monthly_visit_limit(p_inmate_id, p_visit_date) THEN
      RETURN jsonb_build_object('error', 'MONTHLY_LIMIT');
    END IF;
    RETURN jsonb_build_object('error', 'NO_SLOT');
  END IF;

  -- Insert the registration.
  INSERT INTO visit_registrations (
    prison_id, inmate_id, visit_date, time_slot_start, time_slot_end, status
  )
  VALUES (
    p_prison_id, p_inmate_id, p_visit_date, v_slot.slot_start, v_slot.slot_end, 'confirmed'
  )
  RETURNING * INTO v_registration;

  -- Insert visitors (1..3), preserving order.
  v_order := 0;
  FOR v_visitor IN SELECT * FROM jsonb_array_elements(p_visitors)
  LOOP
    v_order := v_order + 1;
    INSERT INTO registration_visitors (
      registration_id, full_name, date_of_birth, citizen_id, relationship, display_order
    )
    VALUES (
      v_registration.id,
      v_visitor->>'full_name',
      (v_visitor->>'date_of_birth')::date,
      v_visitor->>'citizen_id',
      v_visitor->>'relationship',
      v_order
    )
    RETURNING * INTO v_inserted;

    v_visitors := v_visitors || to_jsonb(v_inserted);
  END LOOP;

  RETURN jsonb_build_object(
    'registration', to_jsonb(v_registration),
    'visitors', v_visitors
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'DUPLICATE');
END;
$$;

-- Keep execution grants intact (function was recreated).
GRANT EXECUTE ON FUNCTION fn_submit_registration(UUID, UUID, DATE, JSONB)
  TO anon, authenticated;
