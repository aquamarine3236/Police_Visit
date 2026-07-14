-- Migration 00019: Prevent an inmate from having more than one active visit
-- registration on the same day (BR-06, tightened)
--
-- Requirement
-- -----------
-- "Không được phép tồn tại các ca gặp của cùng một người trong cùng một khung
--  giờ." Business decision: one inmate may NOT hold two active registrations on
-- the same visit_date at all (regardless of visitor or time slot). The public
-- user must see: "Phạm nhân này đã có lịch thăm gặp trong khung giờ đã chọn."
--
-- Problems being fixed
-- --------------------
-- 1. `fn_submit_registration` (migration 00015) only blocked duplicates when the
--    FIRST visitor's CCCD + inmate + date all matched. A different family could
--    still double-book the same inmate on the same day.
-- 2. There was NO database-level guarantee, so a direct write (or a race) could
--    still create two same-day registrations for one inmate.
--
-- Fix strategy
-- ------------
-- 1. Redefine the duplicate check inside `fn_submit_registration` to key off
--    (inmate_id, visit_date) across the active statuses. Everything else
--    (advisory lock, monthly-limit check, slot assignment, inserts) is
--    preserved verbatim from migration 00015.
-- 2. Add a partial UNIQUE index on (inmate_id, visit_date) covering the active
--    statuses so the invariant holds even against direct writes / concurrency.
--    The advisory lock in fn_assign_time_slot already serialises the app path;
--    the index is the last line of defence and never fires under normal flow.

-- ─── 0. Clean up pre-existing duplicates ────────────────────────────────────
-- Before this migration the app only blocked duplicates by first-visitor CCCD,
-- so the table may already contain >1 active registration for the same
-- (inmate_id, visit_date). Those rows would make the UNIQUE index creation
-- below fail (SQLSTATE 23505). Resolve them deterministically by KEEPING the
-- earliest registration (oldest created_at, id as tiebreaker) and DELETING the
-- rest. Their `registration_visitors` rows cascade automatically (00005).
--
-- This is a data-loss operation by necessity, but it only removes redundant
-- same-day double-bookings for one inmate — which the new rule forbids anyway.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY inmate_id, visit_date
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM visit_registrations
  WHERE status IN ('confirmed', 'completed', 'no_show')
)
DELETE FROM visit_registrations
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ─── 1. Enforce the invariant at the database level ─────────────────────────
-- Only "active" registrations count (a cancelled/deleted row must not block a
-- re-registration). All three current statuses are active, but scoping the
-- index by status keeps the intent explicit and future-proof.

CREATE UNIQUE INDEX IF NOT EXISTS uq_vr_inmate_visit_date_active
  ON visit_registrations (inmate_id, visit_date)
  WHERE status IN ('confirmed', 'completed', 'no_show');

-- ─── 2. Tighten the duplicate check in the submission RPC ───────────────────

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
BEGIN
  -- Duplicate prevention (BR-06, tightened): an inmate cannot have two active
  -- registrations on the same date, regardless of visitor or time slot.
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
  -- Safety net: if a concurrent transaction wins the race between the advisory
  -- lock release and this insert, the unique index raises unique_violation.
  -- Map it to the same DUPLICATE code the app already handles.
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'DUPLICATE');
END;
$$;

-- Keep execution grants intact (function was recreated).
GRANT EXECUTE ON FUNCTION fn_submit_registration(UUID, UUID, DATE, JSONB)
  TO anon, authenticated;
