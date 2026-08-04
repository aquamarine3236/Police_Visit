-- ============================================================================
-- 51_functions_admin_profile — Profile self-service + Super Admin management
-- ============================================================================
-- Same rationale as 13/14_functions_admin_*.sql: the app writes with the
-- new-format SECRET API key (`sb_secret_…`), which does NOT bypass RLS, and
-- the tables touched here (`admin_profiles`, `admin_prison_assignments`,
-- `prisons`) intentionally expose NO write policies to API roles. All writes
-- therefore go through SECURITY DEFINER RPCs that enforce authorisation
-- internally (caller identity from auth.uid(), never from client input).
--
-- Two authorisation tiers:
--   * Self-service (any active admin): change own display name, switch own
--     active prison (only to a prison assigned via admin_prison_assignments).
--   * Super admin (role = 'super_admin'): list/manage admins, replace prison
--     assignments, toggle activation, create admin profiles, manage prisons.

-- ─── fn_is_super_admin — internal guard helper ───────────────────────────────
-- Not granted to any API role; only invoked from inside the definer functions
-- below.
CREATE OR REPLACE FUNCTION fn_is_super_admin(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE id = p_uid AND role = 'super_admin' AND is_active = true
  );
$$;

REVOKE ALL ON FUNCTION fn_is_super_admin(UUID) FROM PUBLIC, anon, authenticated;

-- ─── fn_update_own_display_name ──────────────────────────────────────────────
-- Updates the caller's own full_name. Returns the updated profile as JSONB or
-- { error: 'NOT_FOUND' } when the caller has no active admin profile.
CREATE OR REPLACE FUNCTION fn_update_own_display_name(p_full_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated admin_profiles%ROWTYPE;
BEGIN
  IF btrim(COALESCE(p_full_name, '')) = '' THEN
    RETURN jsonb_build_object('error', 'INVALID_NAME');
  END IF;

  UPDATE admin_profiles
  SET full_name  = btrim(p_full_name),
      updated_by = auth.uid()
  WHERE id = auth.uid() AND is_active = true
  RETURNING * INTO v_updated;

  IF v_updated.id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

-- ─── fn_switch_active_prison ─────────────────────────────────────────────────
-- Switches the caller's ACTIVE prison. Only allowed when the target prison is
-- assigned to the caller in admin_prison_assignments and is active.
-- Returns the updated profile as JSONB, or an { error } object:
--   * NOT_FOUND     — caller has no active admin profile
--   * NOT_ASSIGNED  — target prison is not assigned to the caller (or inactive)
CREATE OR REPLACE FUNCTION fn_switch_active_prison(p_prison_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile admin_profiles%ROWTYPE;
  v_updated admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM admin_profiles
  WHERE id = auth.uid() AND is_active = true;

  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM admin_prison_assignments apa
    JOIN prisons p ON p.id = apa.prison_id AND p.is_active = true
    WHERE apa.admin_id = auth.uid()
      AND apa.prison_id = p_prison_id
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_ASSIGNED');
  END IF;

  UPDATE admin_profiles
  SET prison_id  = p_prison_id,
      updated_by = auth.uid()
  WHERE id = auth.uid()
  RETURNING * INTO v_updated;

  RETURN to_jsonb(v_updated);
END;
$$;

-- ─── fn_sa_list_admins ───────────────────────────────────────────────────────
-- Super admin only. Lists every admin profile with email (from auth.users) and
-- the aggregated list of assigned prisons. Returns a JSONB array, or
-- { error: 'FORBIDDEN' }.
CREATE OR REPLACE FUNCTION fn_sa_list_admins()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at')
      FROM (
        SELECT jsonb_build_object(
          'id', ap.id,
          'email', u.email,
          'full_name', ap.full_name,
          'role', ap.role,
          'is_active', ap.is_active,
          'prison_id', ap.prison_id,
          'created_at', ap.created_at,
          'assigned_prisons', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code)
                ORDER BY p.name
              )
              FROM admin_prison_assignments apa
              JOIN prisons p ON p.id = apa.prison_id
              WHERE apa.admin_id = ap.id
            ),
            '[]'::jsonb
          )
        ) AS row_data
        FROM admin_profiles ap
        LEFT JOIN auth.users u ON u.id = ap.id
      ) rows
    ),
    '[]'::jsonb
  );
END;
$$;

-- ─── fn_sa_set_admin_prisons ─────────────────────────────────────────────────
-- Super admin only. REPLACES the target admin's prison assignments with
-- p_prison_ids. If the current active prison falls out of the new set, the
-- active prison is reset to the first assigned prison. Errors:
--   * FORBIDDEN         — caller is not an active super admin
--   * NOT_FOUND         — target admin does not exist
--   * TARGET_SUPER_ADMIN— target is a super admin (they hold no prisons)
--   * EMPTY_PRISONS     — a regular admin must keep at least one prison
--   * UNKNOWN_PRISON    — one of the ids does not match an existing prison
CREATE OR REPLACE FUNCTION fn_sa_set_admin_prisons(
  p_admin_id   UUID,
  p_prison_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target      admin_profiles%ROWTYPE;
  v_valid_count INTEGER;
  v_new_active  UUID;
BEGIN
  IF NOT fn_is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_target FROM admin_profiles WHERE id = p_admin_id;
  IF v_target.id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;
  IF v_target.role = 'super_admin' THEN
    RETURN jsonb_build_object('error', 'TARGET_SUPER_ADMIN');
  END IF;
  IF p_prison_ids IS NULL OR array_length(p_prison_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('error', 'EMPTY_PRISONS');
  END IF;

  SELECT COUNT(*) INTO v_valid_count
  FROM prisons WHERE id = ANY (p_prison_ids);
  IF v_valid_count <> (SELECT COUNT(DISTINCT x) FROM unnest(p_prison_ids) AS x) THEN
    RETURN jsonb_build_object('error', 'UNKNOWN_PRISON');
  END IF;

  -- Replace assignments.
  DELETE FROM admin_prison_assignments
  WHERE admin_id = p_admin_id
    AND prison_id <> ALL (p_prison_ids);

  INSERT INTO admin_prison_assignments (admin_id, prison_id, created_by)
  SELECT p_admin_id, x, auth.uid()
  FROM unnest(p_prison_ids) AS x
  ON CONFLICT (admin_id, prison_id) DO NOTHING;

  -- Keep the active prison consistent with the new set.
  IF v_target.prison_id IS NULL OR v_target.prison_id <> ALL (p_prison_ids) THEN
    v_new_active := p_prison_ids[1];
    UPDATE admin_profiles
    SET prison_id  = v_new_active,
        updated_by = auth.uid()
    WHERE id = p_admin_id;
  END IF;

  RETURN jsonb_build_object('updated', true);
END;
$$;

-- ─── fn_sa_set_admin_active ──────────────────────────────────────────────────
-- Super admin only. Activates/deactivates an admin account. A super admin
-- cannot deactivate their own account (avoids locking themselves out).
CREATE OR REPLACE FUNCTION fn_sa_set_admin_active(
  p_admin_id UUID,
  p_active   BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated admin_profiles%ROWTYPE;
BEGIN
  IF NOT fn_is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  IF p_admin_id = auth.uid() AND p_active = false THEN
    RETURN jsonb_build_object('error', 'CANNOT_DEACTIVATE_SELF');
  END IF;

  UPDATE admin_profiles
  SET is_active  = p_active,
      updated_by = auth.uid()
  WHERE id = p_admin_id
  RETURNING * INTO v_updated;

  IF v_updated.id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

-- ─── fn_sa_create_admin_profile ──────────────────────────────────────────────
-- Super admin only. Creates the admin_profiles row (+ assignments) for a user
-- that was just created through the GoTrue Admin API (auth.users). The active
-- prison is set to the first assigned prison. Errors:
--   * FORBIDDEN       — caller is not an active super admin
--   * INVALID_ROLE    — p_role not in ('admin', 'super_admin')
--   * EMPTY_PRISONS   — regular admin requires at least one prison
--   * UNKNOWN_PRISON  — an id does not match an existing prison
--   * ALREADY_EXISTS  — a profile already exists for this user id
CREATE OR REPLACE FUNCTION fn_sa_create_admin_profile(
  p_user_id    UUID,
  p_full_name  TEXT,
  p_role       TEXT,
  p_prison_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid_count INTEGER;
  v_created     admin_profiles%ROWTYPE;
BEGIN
  IF NOT fn_is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  IF p_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('error', 'INVALID_ROLE');
  END IF;

  IF EXISTS (SELECT 1 FROM admin_profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'ALREADY_EXISTS');
  END IF;

  IF p_role = 'admin' THEN
    IF p_prison_ids IS NULL OR array_length(p_prison_ids, 1) IS NULL THEN
      RETURN jsonb_build_object('error', 'EMPTY_PRISONS');
    END IF;

    SELECT COUNT(*) INTO v_valid_count
    FROM prisons WHERE id = ANY (p_prison_ids);
    IF v_valid_count <> (SELECT COUNT(DISTINCT x) FROM unnest(p_prison_ids) AS x) THEN
      RETURN jsonb_build_object('error', 'UNKNOWN_PRISON');
    END IF;
  END IF;

  INSERT INTO admin_profiles (id, prison_id, full_name, role, is_active, created_by, updated_by)
  VALUES (
    p_user_id,
    CASE WHEN p_role = 'admin' THEN p_prison_ids[1] ELSE NULL END,
    btrim(p_full_name),
    p_role,
    true,
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_created;

  IF p_role = 'admin' THEN
    INSERT INTO admin_prison_assignments (admin_id, prison_id, created_by)
    SELECT p_user_id, x, auth.uid()
    FROM unnest(p_prison_ids) AS x
    ON CONFLICT (admin_id, prison_id) DO NOTHING;
  END IF;

  RETURN to_jsonb(v_created);
END;
$$;

-- ─── fn_sa_list_prisons ──────────────────────────────────────────────────────
-- Super admin only. Lists all prisons (active and inactive) with the number of
-- assigned admins.
CREATE OR REPLACE FUNCTION fn_sa_list_prisons()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'code', p.code,
          'address', p.address,
          'phone', p.phone,
          'is_active', p.is_active,
          'created_at', p.created_at,
          'admin_count', (
            SELECT COUNT(*) FROM admin_prison_assignments apa
            WHERE apa.prison_id = p.id
          )
        )
        ORDER BY p.name
      )
      FROM prisons p
    ),
    '[]'::jsonb
  );
END;
$$;

-- ─── fn_sa_upsert_prison ─────────────────────────────────────────────────────
-- Super admin only. Creates (p_id IS NULL) or updates a prison. Prisons are
-- never deleted — deactivate instead (admin_profiles.prison_id references
-- prisons ON DELETE CASCADE, so deletion would cascade-drop admin profiles).
-- Errors: FORBIDDEN, NOT_FOUND, DUPLICATE_CODE, INVALID_INPUT.
CREATE OR REPLACE FUNCTION fn_sa_upsert_prison(
  p_id        UUID,
  p_name      TEXT,
  p_code      TEXT,
  p_address   TEXT,
  p_phone     TEXT,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row prisons%ROWTYPE;
BEGIN
  IF NOT fn_is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  IF btrim(COALESCE(p_name, '')) = '' OR btrim(COALESCE(p_code, '')) = '' THEN
    RETURN jsonb_build_object('error', 'INVALID_INPUT');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO prisons (name, code, address, phone, is_active)
    VALUES (
      btrim(p_name),
      btrim(p_code),
      NULLIF(btrim(COALESCE(p_address, '')), ''),
      NULLIF(btrim(COALESCE(p_phone, '')), ''),
      COALESCE(p_is_active, true)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE prisons
    SET name      = btrim(p_name),
        code      = btrim(p_code),
        address   = NULLIF(btrim(COALESCE(p_address, '')), ''),
        phone     = NULLIF(btrim(COALESCE(p_phone, '')), ''),
        is_active = COALESCE(p_is_active, true)
    WHERE id = p_id
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      RETURN jsonb_build_object('error', 'NOT_FOUND');
    END IF;
  END IF;

  RETURN to_jsonb(v_row);

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'DUPLICATE_CODE');
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Authenticated admins only. Public (anon) must never call these; the
-- super-admin functions additionally enforce role internally.
REVOKE ALL ON FUNCTION fn_update_own_display_name(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_update_own_display_name(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION fn_switch_active_prison(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_switch_active_prison(UUID) TO authenticated;

REVOKE ALL ON FUNCTION fn_sa_list_admins() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_sa_list_admins() TO authenticated;

REVOKE ALL ON FUNCTION fn_sa_set_admin_prisons(UUID, UUID[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_sa_set_admin_prisons(UUID, UUID[]) TO authenticated;

REVOKE ALL ON FUNCTION fn_sa_set_admin_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_sa_set_admin_active(UUID, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION fn_sa_create_admin_profile(UUID, TEXT, TEXT, UUID[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_sa_create_admin_profile(UUID, TEXT, TEXT, UUID[]) TO authenticated;

REVOKE ALL ON FUNCTION fn_sa_list_prisons() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_sa_list_prisons() TO authenticated;

REVOKE ALL ON FUNCTION fn_sa_upsert_prison(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_sa_upsert_prison(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
