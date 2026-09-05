-- ============================================================================
-- 62_remove_relative_visitor_citizen_id
-- Remove citizen_id from approved relatives and registration visitor snapshots.
-- Existing migrations remain immutable; this migration updates the live schema.
-- ============================================================================

DROP FUNCTION IF EXISTS fn_submit_registration(UUID, UUID, DATE, JSONB);
DROP FUNCTION IF EXISTS fn_bulk_import_relatives(JSONB, UUID);
DROP FUNCTION IF EXISTS fn_admin_update_relative(UUID, UUID, TEXT, DATE, TEXT, TEXT, UUID);

DROP INDEX IF EXISTS idx_inmate_relatives_citizen_id;
DROP INDEX IF EXISTS uq_inmate_relatives_inmate_citizen;
DROP INDEX IF EXISTS idx_rv_citizen_id;

ALTER TABLE inmate_relatives
  DROP CONSTRAINT IF EXISTS inmate_relatives_citizen_id_check,
  DROP COLUMN IF EXISTS citizen_id;

ALTER TABLE registration_visitors
  DROP COLUMN IF EXISTS citizen_id;

-- ─── Public registration submission ─────────────────────────────────────────
-- Visitors are matched against the inmate's approved relatives using all
-- remaining identifying fields. A name-only match is intentionally avoided:
-- date of birth and relationship prevent an ambiguous relative from being
-- selected silently.
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
  v_ambiguous_positions INTEGER[] := ARRAY[]::INTEGER[];
  v_visitor_date_of_birth DATE;
BEGIN
  v_order := 0;
  FOR v_visitor IN SELECT * FROM jsonb_array_elements(p_visitors)
  LOOP
    v_order := v_order + 1;
    v_visitor_date_of_birth := NULLIF(v_visitor->>'date_of_birth', '')::date;

    SELECT COUNT(*) INTO v_match_count
    FROM inmate_relatives r
    WHERE r.inmate_id = p_inmate_id
      AND fn_normalize_vietnamese_name(r.full_name) =
          fn_normalize_vietnamese_name(v_visitor->>'full_name')
      AND r.date_of_birth IS NOT DISTINCT FROM v_visitor_date_of_birth
      AND lower(btrim(r.relationship)) = lower(btrim(v_visitor->>'relationship'));

    IF v_match_count = 0 THEN
      v_invalid_positions := array_append(v_invalid_positions, v_order);
    ELSIF v_match_count > 1 THEN
      v_ambiguous_positions := array_append(v_ambiguous_positions, v_order);
    END IF;
  END LOOP;

  IF array_length(v_ambiguous_positions, 1) > 0 THEN
    RETURN jsonb_build_object(
      'error', 'AMBIGUOUS_RELATIVE',
      'positions', to_jsonb(v_ambiguous_positions)
    );
  END IF;

  IF array_length(v_invalid_positions, 1) > 0 THEN
    RETURN jsonb_build_object(
      'error', 'NOT_RELATIVE',
      'positions', to_jsonb(v_invalid_positions)
    );
  END IF;

  SELECT COUNT(*) INTO v_duplicate_count
  FROM visit_registrations vr
  WHERE vr.inmate_id = p_inmate_id
    AND vr.visit_date = p_visit_date
    AND vr.status IN ('confirmed', 'completed', 'no_show');

  IF v_duplicate_count > 0 THEN
    RETURN jsonb_build_object('error', 'DUPLICATE');
  END IF;

  SELECT * INTO v_slot
  FROM fn_assign_time_slot(p_prison_id, p_visit_date, p_inmate_id);

  IF v_slot IS NULL OR v_slot.slot_start IS NULL THEN
    IF NOT fn_check_monthly_visit_limit(p_inmate_id, p_visit_date) THEN
      RETURN jsonb_build_object('error', 'MONTHLY_LIMIT');
    END IF;
    RETURN jsonb_build_object('error', 'NO_SLOT');
  END IF;

  INSERT INTO visit_registrations (
    prison_id, inmate_id, visit_date, time_slot_start, time_slot_end, status
  )
  VALUES (
    p_prison_id, p_inmate_id, p_visit_date, v_slot.slot_start, v_slot.slot_end, 'confirmed'
  )
  RETURNING * INTO v_registration;

  v_order := 0;
  FOR v_visitor IN SELECT * FROM jsonb_array_elements(p_visitors)
  LOOP
    v_order := v_order + 1;

    INSERT INTO registration_visitors (
      registration_id, full_name, date_of_birth, relationship, display_order
    )
    VALUES (
      v_registration.id,
      btrim(v_visitor->>'full_name'),
      NULLIF(v_visitor->>'date_of_birth', '')::date,
      btrim(v_visitor->>'relationship'),
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

REVOKE ALL ON FUNCTION fn_submit_registration(UUID, UUID, DATE, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_submit_registration(UUID, UUID, DATE, JSONB)
  TO anon, authenticated;

-- ─── Bulk relative import ───────────────────────────────────────────────────
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
  v_duplicate_count INTEGER;
BEGIN
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_groups)
  LOOP
    v_inmate_id := (v_group->>'inmate_id')::uuid;

    SELECT COUNT(*) INTO v_existing_count
    FROM inmate_relatives
    WHERE inmate_id = v_inmate_id;

    SELECT COUNT(*) INTO v_incoming_count
    FROM jsonb_array_elements(v_group->'relatives') AS rel
    WHERE NOT EXISTS (
      SELECT 1
      FROM inmate_relatives ir
      WHERE ir.inmate_id = v_inmate_id
        AND fn_normalize_vietnamese_name(ir.full_name) =
            fn_normalize_vietnamese_name(rel->>'full_name')
        AND ir.date_of_birth IS NOT DISTINCT FROM NULLIF(rel->>'date_of_birth', '')::date
        AND lower(btrim(ir.relationship)) = lower(btrim(rel->>'relationship'))
    );

    IF v_existing_count + v_incoming_count > 10 THEN
      RAISE EXCEPTION 'LIMIT_EXCEEDED:%', v_inmate_id
        USING ERRCODE = 'check_violation';
    END IF;

    FOR v_relative IN SELECT * FROM jsonb_array_elements(v_group->'relatives')
    LOOP
      SELECT COUNT(*) INTO v_duplicate_count
      FROM inmate_relatives ir
      WHERE ir.inmate_id = v_inmate_id
        AND fn_normalize_vietnamese_name(ir.full_name) =
            fn_normalize_vietnamese_name(v_relative->>'full_name')
        AND ir.date_of_birth IS NOT DISTINCT FROM NULLIF(v_relative->>'date_of_birth', '')::date
        AND lower(btrim(ir.relationship)) = lower(btrim(v_relative->>'relationship'));

      IF v_duplicate_count > 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO inmate_relatives (
        inmate_id, full_name, date_of_birth, relationship, created_by, updated_by
      )
      VALUES (
        v_inmate_id,
        btrim(v_relative->>'full_name'),
        NULLIF(v_relative->>'date_of_birth', '')::date,
        btrim(v_relative->>'relationship'),
        p_user_id,
        p_user_id
      )
      RETURNING id INTO v_inserted_id;

      v_imported := v_imported + 1;
      v_inserted_id := NULL;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('imported', v_imported, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION fn_bulk_import_relatives(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_bulk_import_relatives(JSONB, UUID) TO authenticated;

-- ─── Admin relative update ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_admin_update_relative(
  p_id            UUID,
  p_prison_id     UUID,
  p_full_name     TEXT,
  p_date_of_birth DATE,
  p_relationship  TEXT,
  p_user_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inmate_id   UUID;
  v_row_prison  UUID;
  v_updated     inmate_relatives%ROWTYPE;
BEGIN
  SELECT inmate_id INTO v_inmate_id
  FROM inmate_relatives
  WHERE id = p_id;

  IF v_inmate_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  v_row_prison := fn_inmate_prison_id(v_inmate_id);
  IF v_row_prison IS NULL OR v_row_prison <> p_prison_id THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  UPDATE inmate_relatives
  SET full_name     = btrim(p_full_name),
      date_of_birth = p_date_of_birth,
      relationship  = btrim(p_relationship),
      updated_by    = p_user_id
  WHERE id = p_id
  RETURNING * INTO v_updated;

  RETURN to_jsonb(v_updated);
END;
$$;

REVOKE ALL ON FUNCTION fn_admin_update_relative(UUID, UUID, TEXT, DATE, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_admin_update_relative(UUID, UUID, TEXT, DATE, TEXT, UUID) TO authenticated;

-- The delete RPC signature is unchanged; preserve its authenticated-only grant.
REVOKE ALL ON FUNCTION fn_admin_delete_relative(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_admin_delete_relative(UUID, UUID) TO authenticated;
