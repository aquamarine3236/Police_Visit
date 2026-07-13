-- Migration 00015: Secure the public registration flow (fixes C1 + C2)
--
-- Problem being fixed
-- -------------------
-- Public registration runs as the anonymous (`anon`) role. Under RLS:
--   * `visit_registrations` had only an INSERT policy (no SELECT), so
--     `INSERT ... RETURNING` returned nothing to the client.
--   * `fn_assign_time_slot` / `fn_check_monthly_visit_limit` were SECURITY
--     INVOKER, so their SELECTs against `visit_registrations` returned 0 rows
--     for `anon` -> slot counts always 0 -> overbooking + monthly-limit bypass.
--   * `registration_visitors` had NO RLS at all (PII exposed via anon key).
--
-- Fix strategy
-- ------------
-- 1. Enable RLS on `registration_visitors` with admin-only access; the public
--    no longer writes to it directly.
-- 2. Make the scheduling helper functions SECURITY DEFINER so they can read the
--    full `visit_registrations` table when computing capacity / limits.
-- 3. Introduce a single SECURITY DEFINER RPC `fn_submit_registration` that
--    performs the duplicate check, slot assignment, and the registration +
--    visitor inserts atomically, returning the created rows as JSON.

-- ─── 1. Lock down registration_visitors ─────────────────────────────────────

ALTER TABLE registration_visitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_registration_visitors_prison ON registration_visitors;
CREATE POLICY admin_registration_visitors_prison ON registration_visitors
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM visit_registrations vr
      WHERE vr.id = registration_visitors.registration_id
        AND vr.prison_id::text = auth.jwt() ->> 'prison_id'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM visit_registrations vr
      WHERE vr.id = registration_visitors.registration_id
        AND vr.prison_id::text = auth.jwt() ->> 'prison_id'
    )
  );

-- ─── 2. Promote scheduling helpers to SECURITY DEFINER ──────────────────────

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
  SELECT classification
  FROM inmates
  WHERE id = p_inmate_id
), counted AS (
  SELECT COUNT(*) AS visit_count
  FROM visit_registrations vr
  WHERE vr.inmate_id = p_inmate_id
    AND vr.visit_date >= date_trunc('month', p_visit_date)::date
    AND vr.visit_date < (date_trunc('month', p_visit_date) + INTERVAL '1 month')::date
    AND vr.status IN ('confirmed', 'completed', 'no_show')
)
SELECT
  CASE
    WHEN classification = 'Người bị tạm giữ' THEN counted.visit_count < 2
    ELSE counted.visit_count < 1
  END
FROM inmate_data, counted;
$$;

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

-- ─── 3. Atomic public submission RPC ────────────────────────────────────────
-- Runs as SECURITY DEFINER so it can read/write the RLS-protected tables while
-- still enforcing every business rule. Returns a JSON payload with the created
-- registration + visitors, or a structured error code the app maps to a
-- localized message.

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
  v_first_cccd TEXT;
  v_duplicate_count INTEGER;
  v_slot RECORD;
  v_registration visit_registrations%ROWTYPE;
  v_visitor JSONB;
  v_order INTEGER := 0;
  v_visitors JSONB := '[]'::jsonb;
  v_inserted registration_visitors%ROWTYPE;
BEGIN
  -- Duplicate prevention (BR-06): same first-visitor CCCD + inmate + date.
  v_first_cccd := p_visitors->0->>'citizen_id';

  SELECT COUNT(*) INTO v_duplicate_count
  FROM visit_registrations vr
  JOIN registration_visitors rv ON rv.registration_id = vr.id
  WHERE rv.citizen_id = v_first_cccd
    AND rv.display_order = 1
    AND vr.inmate_id = p_inmate_id
    AND vr.visit_date = p_visit_date
    AND vr.status IN ('confirmed', 'completed', 'no_show');

  IF v_duplicate_count > 0 THEN
    RETURN jsonb_build_object('error', 'DUPLICATE');
  END IF;

  -- Slot assignment (acquires advisory lock, checks monthly limit + capacity).
  SELECT * INTO v_slot
  FROM fn_assign_time_slot(p_prison_id, p_visit_date, p_inmate_id);

  IF v_slot IS NULL OR v_slot.slot_start IS NULL THEN
    -- Distinguish "monthly limit exceeded" from "no capacity left".
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
END;
$$;

-- Only the anon/authenticated API roles need to call the submission RPC.
GRANT EXECUTE ON FUNCTION fn_submit_registration(UUID, UUID, DATE, JSONB)
  TO anon, authenticated;

-- ─── 4. Public inmate lookup for cross-verification ─────────────────────────
-- The `public_inmates_read` RLS policy only exposes inmates with
-- `visit_status = 'Có thể thăm gặp'`. That means a RESTRICTED inmate would be
-- invisible to `anon`, so the app could not tell "not found" apart from
-- "restricted" (BR-04). This SECURITY DEFINER lookup returns just the fields
-- needed to cross-verify identity + visit status, without leaking other PII.

CREATE OR REPLACE FUNCTION fn_lookup_inmate_for_registration(
  p_prison_id UUID,
  p_prison_number TEXT
)
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  date_of_birth DATE,
  classification TEXT,
  visit_status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name::text, date_of_birth, classification::text, visit_status::text
  FROM inmates
  WHERE prison_id = p_prison_id
    AND prison_number = p_prison_number
    AND deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION fn_lookup_inmate_for_registration(UUID, TEXT)
  TO anon, authenticated;
