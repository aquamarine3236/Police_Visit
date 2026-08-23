-- ============================================================================
-- 12_functions_scheduling — Registration / scheduling business logic (FINAL)
-- ============================================================================
-- Sources (merged, only the FINAL version of each function is kept):
--   fn_check_monthly_visit_limit       → FINAL from 00024
--       (supersedes 00009, 00015)
--   fn_assign_time_slot                → FINAL from 00025
--       (supersedes 00010, 00015, 00018, 00024 — 00024 reintroduced the
--        generate_series-over-TIME bug that 00025 fixed for good)
--   fn_lookup_inmate_for_registration  → from 00015
--   fn_submit_registration             → FINAL from 00024
--       (supersedes 00015, 00019, 00022)
--   fn_bulk_import_relatives           → from 00023
--
-- All functions are SECURITY DEFINER with a fixed search_path so they can read
-- the RLS-protected tables while enforcing every business rule for anon callers.

-- ─── fn_check_monthly_visit_limit ────────────────────────────────────────────
-- Visit-limit rules:
--   * 'Người bị tạm giữ' → max 3 visits TOTAL since classification_changed_at.
--   * All other classifications → max 1 visit per calendar month.
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
  -- Count ALL visits since classification was changed (for 'Người bị tạm giữ').
  SELECT COUNT(*) AS visit_count
  FROM visit_registrations vr, inmate_data id
  WHERE vr.inmate_id = p_inmate_id
    AND vr.visit_date >= id.classification_changed_at::date
    AND vr.status IN ('confirmed', 'completed', 'no_show')
), counted_monthly AS (
  -- Count visits in the same calendar month as p_visit_date (other classes).
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
      THEN counted_total.visit_count < 3
    ELSE counted_monthly.visit_count < 1
  END
FROM inmate_data, counted_total, counted_monthly;
$$;

-- ─── fn_assign_time_slot ─────────────────────────────────────────────────────
-- Returns the first available (start, end) slot for the given prison/date, or
-- no rows if the monthly limit is hit or every slot is full.
--
-- Correctness notes:
--   * Advisory lock is acquired FIRST so the limit check and capacity check are
--     atomic w.r.t. concurrent inserts.
--   * TIME values are anchored onto a fixed dummy DATE so generate_series runs
--     over `timestamp` (a supported overload) — PostgreSQL has NO
--     generate_series(time, time, interval). Only the TIME part is returned.
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

GRANT EXECUTE ON FUNCTION fn_assign_time_slot(UUID, DATE, UUID)
  TO anon, authenticated;

-- ─── fn_lookup_inmate_for_registration ──────────────────────────────────────
-- Public inmate lookup for cross-verification during registration. The
-- public_inmates_read RLS policy only exposes 'Được thăm gặp' inmates, which
-- would make a RESTRICTED inmate indistinguishable from "not found" (BR-04).
-- This SECURITY DEFINER lookup returns only the fields needed to cross-verify
-- identity + visit status, without leaking other PII.
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

-- ─── fn_submit_registration ──────────────────────────────────────────────────
-- Atomic public submission RPC. Enforces, in order:
--   1. Relative check (every visitor must be an approved relative of the inmate;
--      matched on CCCD + normalized full_name; date_of_birth ignored). If any
--      visitor fails, returns { error: NOT_RELATIVE, positions: [...] } and
--      inserts nothing.
--   2. Duplicate prevention (BR-06): an inmate cannot hold two active
--      registrations on the same date.
--   3. Slot assignment (advisory lock + monthly limit + capacity).
--   4. Insert the registration + visitors (1..3), returning them as JSON.
-- The unique_violation safety net maps a lost race to the DUPLICATE code.
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
  v_resolved_citizen_id TEXT;
  v_visitor_citizen_id TEXT;
BEGIN
  -- ─── Relative check ───────────────────────────────────────────────────────
  -- Every visitor must be in the inmate's approved-relatives list.
  -- When citizen_id is provided: match on citizen_id + normalized full_name.
  -- When citizen_id is empty/null (public form): match on normalized full_name
  -- only and resolve citizen_id from the matched relative record.
  v_order := 0;
  FOR v_visitor IN SELECT * FROM jsonb_array_elements(p_visitors)
  LOOP
    v_order := v_order + 1;
    v_visitor_citizen_id := NULLIF(btrim(v_visitor->>'citizen_id'), '');

    IF v_visitor_citizen_id IS NOT NULL THEN
      -- Original behaviour: match on citizen_id + full_name.
      SELECT COUNT(*) INTO v_match_count
      FROM inmate_relatives r
      WHERE r.inmate_id = p_inmate_id
        AND r.citizen_id = v_visitor_citizen_id
        AND lower(btrim(r.full_name)) = lower(btrim(v_visitor->>'full_name'));
    ELSE
      -- Public form: citizen_id not provided. Match by full_name only.
      SELECT COUNT(*) INTO v_match_count
      FROM inmate_relatives r
      WHERE r.inmate_id = p_inmate_id
        AND lower(btrim(r.full_name)) = lower(btrim(v_visitor->>'full_name'));
    END IF;

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
  -- When citizen_id is not provided, resolve it from the inmate_relatives table
  -- to satisfy the NOT NULL constraint on registration_visitors.citizen_id.
  v_order := 0;
  FOR v_visitor IN SELECT * FROM jsonb_array_elements(p_visitors)
  LOOP
    v_order := v_order + 1;
    v_visitor_citizen_id := NULLIF(btrim(v_visitor->>'citizen_id'), '');

    IF v_visitor_citizen_id IS NULL THEN
      -- Resolve citizen_id from the matched relative record.
      SELECT r.citizen_id INTO v_resolved_citizen_id
      FROM inmate_relatives r
      WHERE r.inmate_id = p_inmate_id
        AND lower(btrim(r.full_name)) = lower(btrim(v_visitor->>'full_name'))
      LIMIT 1;
      v_visitor_citizen_id := COALESCE(v_resolved_citizen_id, '');
    END IF;

    INSERT INTO registration_visitors (
      registration_id, full_name, date_of_birth, citizen_id, relationship, display_order
    )
    VALUES (
      v_registration.id,
      v_visitor->>'full_name',
      (v_visitor->>'date_of_birth')::date,
      v_visitor_citizen_id,
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
  -- Safety net: if a concurrent transaction wins the race between the advisory
  -- lock release and this insert, the unique index raises unique_violation.
  -- Map it to the same DUPLICATE code the app already handles.
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'DUPLICATE');
END;
$$;

GRANT EXECUTE ON FUNCTION fn_submit_registration(UUID, UUID, DATE, JSONB)
  TO anon, authenticated;

-- ─── fn_bulk_import_relatives ────────────────────────────────────────────────
-- Transactional bulk import of relatives, grouped by inmate. Enforces the max-10
-- limit up front (clear error instead of a mid-batch trigger failure) and dedups
-- by (inmate_id, citizen_id) via ON CONFLICT DO NOTHING. Any single inmate
-- exceeding 10 rolls back the ENTIRE import (no partial writes).
--
-- Payload:
--   p_groups = [ { inmate_id, relatives: [ { full_name, date_of_birth,
--                                            citizen_id, relationship } ] } ]
-- Returns { imported, skipped } on success, or raises 'LIMIT_EXCEEDED:<uuid>'.
CREATE OR REPLACE FUNCTION fn_bulk_import_relatives(
  p_groups JSONB,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group JSONB;
  v_inmate_id UUID;
  v_relative JSONB;
  v_existing_count INTEGER;
  v_incoming_count INTEGER;
  v_imported INTEGER := 0;
  v_skipped INTEGER := 0;
  v_inserted_id UUID;
BEGIN
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_groups)
  LOOP
    v_inmate_id := (v_group->>'inmate_id')::uuid;

    -- Existing relatives for this inmate.
    SELECT COUNT(*) INTO v_existing_count
    FROM inmate_relatives
    WHERE inmate_id = v_inmate_id;

    -- Distinct NEW (by CCCD) relatives about to be added. Used to enforce the
    -- max-10 ceiling BEFORE inserting, for a clear error message.
    SELECT COUNT(DISTINCT (rel->>'citizen_id')) INTO v_incoming_count
    FROM jsonb_array_elements(v_group->'relatives') AS rel
    WHERE NOT EXISTS (
      SELECT 1 FROM inmate_relatives ir
      WHERE ir.inmate_id = v_inmate_id
        AND ir.citizen_id = (rel->>'citizen_id')
    );

    IF v_existing_count + v_incoming_count > 10 THEN
      -- Raise → rollback the whole transaction (no partial import).
      RAISE EXCEPTION 'LIMIT_EXCEEDED:%', v_inmate_id
        USING ERRCODE = 'check_violation';
    END IF;

    -- Insert each relative, skipping duplicate CCCDs.
    FOR v_relative IN SELECT * FROM jsonb_array_elements(v_group->'relatives')
    LOOP
      INSERT INTO inmate_relatives (
        inmate_id, full_name, date_of_birth, citizen_id, relationship,
        created_by, updated_by
      )
      VALUES (
        v_inmate_id,
        btrim(v_relative->>'full_name'),
        NULLIF(v_relative->>'date_of_birth', '')::date,
        v_relative->>'citizen_id',
        btrim(v_relative->>'relationship'),
        p_user_id,
        p_user_id
      )
      ON CONFLICT (inmate_id, citizen_id) DO NOTHING
      RETURNING id INTO v_inserted_id;

      IF v_inserted_id IS NULL THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_imported := v_imported + 1;
        v_inserted_id := NULL;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('imported', v_imported, 'skipped', v_skipped);
END;
$$;

-- Admin (authenticated) only. Public (anon) does not need this.
REVOKE ALL ON FUNCTION fn_bulk_import_relatives(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_bulk_import_relatives(JSONB, UUID) TO authenticated;
