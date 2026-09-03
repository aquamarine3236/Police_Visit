-- ============================================================================
-- 60_remove_inmate_pii — Remove full_name and citizen_id from inmates table
-- ============================================================================
-- Privacy compliance: the detainee's full name and citizen ID (CCCD) are
-- removed from the inmates table. The prison_number becomes the sole
-- business identifier. Columns on inmate_relatives and registration_visitors
-- are NOT affected — those belong to visitors/relatives.

-- ─── Drop columns ───────────────────────────────────────────────────────────

ALTER TABLE inmates DROP COLUMN IF EXISTS full_name;
ALTER TABLE inmates DROP COLUMN IF EXISTS citizen_id;

-- ─── Recreate fn_lookup_inmate_for_registration ─────────────────────────────
-- Remove full_name from the RETURNS TABLE and SELECT clause.

DROP FUNCTION IF EXISTS fn_lookup_inmate_for_registration(UUID, TEXT);

CREATE OR REPLACE FUNCTION fn_lookup_inmate_for_registration(
  p_prison_id UUID,
  p_prison_number TEXT
)
RETURNS TABLE(
  id UUID,
  date_of_birth DATE,
  classification TEXT,
  visit_status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, date_of_birth, classification::text, visit_status::text
  FROM inmates
  WHERE prison_id = p_prison_id
    AND prison_number = p_prison_number
    AND deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION fn_lookup_inmate_for_registration(UUID, TEXT)
  TO anon, authenticated;

-- ─── Recreate fn_admin_update_inmate ────────────────────────────────────────
-- Remove full_name and citizen_id from the UPDATE SET clause.

DROP FUNCTION IF EXISTS fn_admin_update_inmate(UUID, UUID, JSONB, UUID);

CREATE OR REPLACE FUNCTION fn_admin_update_inmate(
  p_id        UUID,
  p_prison_id UUID,
  p_payload   JSONB,
  p_user_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_prison  UUID;
  v_new_number  TEXT;
  v_dup_count   INTEGER;
  v_updated     inmates%ROWTYPE;
BEGIN
  -- Locate the (active) inmate + verify prison ownership.
  SELECT prison_id INTO v_row_prison
  FROM inmates
  WHERE id = p_id AND deleted_at IS NULL;

  IF v_row_prison IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  IF v_row_prison <> p_prison_id THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  -- Duplicate active prison_number guard within the prison (excluding self).
  v_new_number := p_payload->>'prison_number';
  IF v_new_number IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dup_count
    FROM inmates
    WHERE prison_id = p_prison_id
      AND prison_number = v_new_number
      AND deleted_at IS NULL
      AND id <> p_id;

    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('error', 'DUPLICATE_NUMBER');
    END IF;
  END IF;

  -- Apply only whitelisted columns that are present in the payload.
  -- full_name and citizen_id are no longer part of the inmates table.
  UPDATE inmates SET
    prison_number             = COALESCE(p_payload->>'prison_number', prison_number),
    date_of_birth             = CASE WHEN p_payload ? 'date_of_birth'
                                     THEN NULLIF(p_payload->>'date_of_birth', '')::date
                                     ELSE date_of_birth END,
    permanent_address         = CASE WHEN p_payload ? 'permanent_address'
                                     THEN NULLIF(p_payload->>'permanent_address', '')
                                     ELSE permanent_address END,
    criminal_offense          = CASE WHEN p_payload ? 'criminal_offense'
                                     THEN NULLIF(p_payload->>'criminal_offense', '')
                                     ELSE criminal_offense END,
    arrest_date               = CASE WHEN p_payload ? 'arrest_date'
                                     THEN NULLIF(p_payload->>'arrest_date', '')::date
                                     ELSE arrest_date END,
    admission_date            = CASE WHEN p_payload ? 'admission_date'
                                     THEN NULLIF(p_payload->>'admission_date', '')::date
                                     ELSE admission_date END,
    classification            = COALESCE(p_payload->>'classification', classification),
    visit_status              = COALESCE(p_payload->>'visit_status', visit_status),
    classification_changed_at = CASE WHEN p_payload ? 'classification_changed_at'
                                     THEN (p_payload->>'classification_changed_at')::timestamptz
                                     ELSE classification_changed_at END,
    updated_by                = p_user_id
  WHERE id = p_id AND deleted_at IS NULL
  RETURNING * INTO v_updated;

  RETURN to_jsonb(v_updated);

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'DUPLICATE_NUMBER');
END;
$$;

REVOKE ALL ON FUNCTION fn_admin_update_inmate(UUID, UUID, JSONB, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_admin_update_inmate(UUID, UUID, JSONB, UUID) TO authenticated;
