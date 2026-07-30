-- ============================================================================
-- 13_functions_admin_relatives — Admin UPDATE/DELETE of inmate_relatives (RPC)
-- ============================================================================
-- Why this file exists
-- --------------------------------------------------------------------------
-- The admin app writes to `inmate_relatives` through a Supabase client keyed
-- with the project's SECRET API key (`sb_secret_…`). Unlike the LEGACY
-- service_role JWT (`eyJ…`), the new-format secret key does NOT bypass RLS,
-- so it runs under a role that is still subject to Row-Level Security.
--
-- Effect observed:
--   * INSERT (add) works        — the RLS WITH CHECK clause evaluates fine for
--                                  the new row.
--   * UPDATE / DELETE fail       — the RLS USING clause matches ZERO rows for
--                                  this role, so PostgREST returns HTTP 200 with
--                                  an empty result set and no error. The write
--                                  silently affects nothing.
--
-- Rather than require the legacy JWT key, we move the privileged UPDATE/DELETE
-- into SECURITY DEFINER functions — the SAME pattern the project already uses
-- for `fn_submit_registration` and `fn_bulk_import_relatives`. These functions
-- run with the definer's rights (bypassing RLS) and enforce prison-scope
-- authorisation internally, so they are safe to grant to `authenticated`.
--
-- Authorisation model
--   * The caller passes `p_prison_id` (the admin's prison, taken server-side
--     from the authenticated admin_profiles row — never from client input).
--   * Each function derives the relative's parent inmate prison via
--     `fn_inmate_prison_id` and refuses to act unless it equals `p_prison_id`.
--   * Both are SECURITY DEFINER with a fixed search_path and are granted ONLY
--     to `authenticated` (revoked from anon/public).

-- ─── fn_admin_update_relative ────────────────────────────────────────────────
-- Updates a single relative after verifying it belongs to the admin's prison
-- and that the new CCCD does not collide with another relative of the same
-- inmate. Returns the updated row as JSONB, or an { error } object:
--   * NOT_FOUND        — relative id does not exist
--   * FORBIDDEN        — relative's inmate is not in the caller's prison
--   * DUPLICATE_CCCD   — another relative of this inmate already uses the CCCD
CREATE OR REPLACE FUNCTION fn_admin_update_relative(
  p_id            UUID,
  p_prison_id     UUID,
  p_full_name     TEXT,
  p_date_of_birth DATE,
  p_citizen_id    TEXT,
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
  v_dup_count   INTEGER;
  v_updated     inmate_relatives%ROWTYPE;
BEGIN
  -- Locate the relative + its parent inmate.
  SELECT inmate_id INTO v_inmate_id
  FROM inmate_relatives
  WHERE id = p_id;

  IF v_inmate_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  -- Prison-scope authorisation (bypasses nested RLS via SECURITY DEFINER helper).
  v_row_prison := fn_inmate_prison_id(v_inmate_id);
  IF v_row_prison IS NULL OR v_row_prison <> p_prison_id THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  -- Duplicate-CCCD guard within the same inmate (excluding this row).
  SELECT COUNT(*) INTO v_dup_count
  FROM inmate_relatives
  WHERE inmate_id = v_inmate_id
    AND citizen_id = p_citizen_id
    AND id <> p_id;

  IF v_dup_count > 0 THEN
    RETURN jsonb_build_object('error', 'DUPLICATE_CCCD');
  END IF;

  UPDATE inmate_relatives
  SET full_name     = btrim(p_full_name),
      date_of_birth = p_date_of_birth,
      citizen_id    = p_citizen_id,
      relationship  = btrim(p_relationship),
      updated_by    = p_user_id
  WHERE id = p_id
  RETURNING * INTO v_updated;

  RETURN to_jsonb(v_updated);

EXCEPTION
  -- Belt-and-braces: the UNIQUE (inmate_id, citizen_id) index maps here.
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'DUPLICATE_CCCD');
END;
$$;

-- ─── fn_admin_delete_relative ────────────────────────────────────────────────
-- Deletes a single relative after verifying it belongs to the admin's prison.
-- Returns { deleted: true } on success, or an { error } object:
--   * NOT_FOUND   — relative id does not exist
--   * FORBIDDEN   — relative's inmate is not in the caller's prison
CREATE OR REPLACE FUNCTION fn_admin_delete_relative(
  p_id        UUID,
  p_prison_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inmate_id  UUID;
  v_row_prison UUID;
  v_deleted    INTEGER;
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

  DELETE FROM inmate_relatives WHERE id = p_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('deleted', true);
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Admin (authenticated) only. Public (anon) must never call these.
REVOKE ALL ON FUNCTION fn_admin_update_relative(UUID, UUID, TEXT, DATE, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_admin_update_relative(UUID, UUID, TEXT, DATE, TEXT, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION fn_admin_delete_relative(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_admin_delete_relative(UUID, UUID) TO authenticated;
