-- ============================================================================
-- 14_functions_admin_inmates — Admin UPDATE / soft-DELETE of inmates (RPC)
-- ============================================================================
-- Same rationale as 13_functions_admin_relatives.sql: the admin app writes with
-- the new-format SECRET API key (`sb_secret_…`), which does NOT bypass RLS the
-- way the legacy service_role JWT did. Direct UPDATE/DELETE through PostgREST is
-- therefore silently blocked by the `admin_inmates_prison` RLS policy (0 rows,
-- HTTP 200, no error) — so an edit/soft-delete APPEARS to succeed but changes
-- nothing in the database.
--
-- These SECURITY DEFINER RPCs run with definer rights (bypassing RLS) and
-- enforce prison-scope authorisation internally, so they are safe to grant to
-- `authenticated`. Business rules (uniqueness of active prison_number, blocking
-- soft-delete when future confirmed registrations exist, classification-change
-- timestamp reset) are still enforced in the service layer BEFORE calling these
-- functions; the functions add a final in-DB ownership + row-count guarantee.

-- ─── fn_admin_update_inmate ──────────────────────────────────────────────────
-- Applies a whitelisted JSONB payload to an active inmate owned by the caller's
-- prison. Returns the updated row as JSONB, or an { error } object:
--   * NOT_FOUND        — inmate id does not exist / already soft-deleted
--   * FORBIDDEN        — inmate is not in the caller's prison
--   * DUPLICATE_NUMBER — another active inmate in the prison uses prison_number
--
-- Only keys present in p_payload are updated; unknown keys are ignored. The
-- caller (service layer) is responsible for validating field values.
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
  UPDATE inmates SET
    prison_number             = COALESCE(p_payload->>'prison_number', prison_number),
    full_name                 = COALESCE(p_payload->>'full_name', full_name),
    date_of_birth             = CASE WHEN p_payload ? 'date_of_birth'
                                     THEN NULLIF(p_payload->>'date_of_birth', '')::date
                                     ELSE date_of_birth END,
    citizen_id                = CASE WHEN p_payload ? 'citizen_id'
                                     THEN NULLIF(p_payload->>'citizen_id', '')
                                     ELSE citizen_id END,
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
  -- The partial unique index on (prison_id, prison_number) WHERE deleted_at IS NULL.
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'DUPLICATE_NUMBER');
END;
$$;

-- ─── fn_admin_soft_delete_inmate ─────────────────────────────────────────────
-- Soft-deletes (sets deleted_at) an active inmate owned by the caller's prison.
-- Returns { deleted: true } on success, or an { error } object:
--   * NOT_FOUND   — inmate id does not exist / already soft-deleted
--   * FORBIDDEN   — inmate is not in the caller's prison
--
-- The service layer already blocks deletion when future confirmed registrations
-- exist; this function performs the final ownership-scoped write.
CREATE OR REPLACE FUNCTION fn_admin_soft_delete_inmate(
  p_id        UUID,
  p_prison_id UUID,
  p_user_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_prison UUID;
  v_count      INTEGER;
BEGIN
  SELECT prison_id INTO v_row_prison
  FROM inmates
  WHERE id = p_id AND deleted_at IS NULL;

  IF v_row_prison IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  IF v_row_prison <> p_prison_id THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  UPDATE inmates
  SET deleted_at = now(),
      updated_by = p_user_id
  WHERE id = p_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('deleted', true);
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Admin (authenticated) only. Public (anon) must never call these.
REVOKE ALL ON FUNCTION fn_admin_update_inmate(UUID, UUID, JSONB, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_admin_update_inmate(UUID, UUID, JSONB, UUID) TO authenticated;

REVOKE ALL ON FUNCTION fn_admin_soft_delete_inmate(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_admin_soft_delete_inmate(UUID, UUID, UUID) TO authenticated;
