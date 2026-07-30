-- ============================================================================
-- 30_rls — Row Level Security: enable + all final policies
-- ============================================================================
-- Sources (merged):
--   00008_create_triggers_and_rls.sql        (base ENABLE RLS + policies)
--   00014_grant_auth_hook.sql                (auth_admin_read_admin_profiles —
--                                             defined in 11_functions_auth.sql)
--   00015_secure_registration_flow.sql       (registration_visitors policy)
--   00021_create_inmate_relatives.sql        (inmate_relatives policy)
--   00026_rename_visit_status_available.sql  (public_inmates_read FINAL value)
--
-- Admin scoping is driven by the `prison_id` JWT claim injected by the custom
-- access token hook (11_functions_auth.sql). All CREATE POLICY statements are
-- preceded by DROP POLICY IF EXISTS so this file is idempotent.

-- ─── Enable RLS on every table ───────────────────────────────────────────────
ALTER TABLE prisons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inmates               ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_registrations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE inmate_relatives      ENABLE ROW LEVEL SECURITY;

-- ─── prisons ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS admin_prisons_all ON prisons;
CREATE POLICY admin_prisons_all ON prisons
  FOR ALL
  USING (id::text = auth.jwt() ->> 'prison_id')
  WITH CHECK (id::text = auth.jwt() ->> 'prison_id');

-- ─── admin_profiles ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS admin_profiles_self ON admin_profiles;
CREATE POLICY admin_profiles_self ON admin_profiles
  FOR SELECT
  USING (id = auth.uid());

-- Note: the supabase_auth_admin read policy (auth_admin_read_admin_profiles) is
-- created in 11_functions_auth.sql alongside the hook grants it supports.

-- ─── inmates ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS admin_inmates_prison ON inmates;
CREATE POLICY admin_inmates_prison ON inmates
  FOR ALL
  USING (prison_id::text = auth.jwt() ->> 'prison_id')
  WITH CHECK (prison_id::text = auth.jwt() ->> 'prison_id');

-- Public read exposes only visitable, non-deleted inmates. Uses the renamed
-- visit_status value 'Được thăm gặp' (migration 00026).
DROP POLICY IF EXISTS public_inmates_read ON inmates;
CREATE POLICY public_inmates_read ON inmates
  FOR SELECT
  USING (deleted_at IS NULL AND visit_status = 'Được thăm gặp');

-- ─── visit_registrations ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS admin_visit_registrations_prison ON visit_registrations;
CREATE POLICY admin_visit_registrations_prison ON visit_registrations
  FOR ALL
  USING (prison_id::text = auth.jwt() ->> 'prison_id')
  WITH CHECK (prison_id::text = auth.jwt() ->> 'prison_id');

DROP POLICY IF EXISTS public_visit_registrations_insert ON visit_registrations;
CREATE POLICY public_visit_registrations_insert ON visit_registrations
  FOR INSERT
  WITH CHECK (true);

-- ─── registration_visitors ──────────────────────────────────────────────────
-- Admin-only, scoped through the parent registration's prison. The public no
-- longer writes here directly — inserts happen inside fn_submit_registration
-- (SECURITY DEFINER).
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

-- ─── scheduling_settings ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS admin_settings_prison ON scheduling_settings;
CREATE POLICY admin_settings_prison ON scheduling_settings
  FOR ALL
  USING (prison_id::text = auth.jwt() ->> 'prison_id')
  WITH CHECK (prison_id::text = auth.jwt() ->> 'prison_id');

DROP POLICY IF EXISTS public_settings_read ON scheduling_settings;
CREATE POLICY public_settings_read ON scheduling_settings
  FOR SELECT
  USING (true);

-- ─── audit_logs ──────────────────────────────────────────────────────────────
-- Admin SELECT only. No INSERT policy: rows are written by SECURITY DEFINER
-- audit trigger functions that bypass RLS.
DROP POLICY IF EXISTS admin_audit_logs_prison ON audit_logs;
CREATE POLICY admin_audit_logs_prison ON audit_logs
  FOR SELECT
  USING (prison_id::text = auth.jwt() ->> 'prison_id');

-- ─── inmate_relatives ────────────────────────────────────────────────────────
-- Admin scoped through the parent inmate's prison.
--
-- Scoping is resolved via fn_inmate_prison_id (SECURITY DEFINER, 10_functions_util.sql)
-- instead of an inline `EXISTS (SELECT … FROM inmates …)`. An inline subquery
-- runs under the caller's RLS context (nested RLS), which for the `authenticated`
-- role could return no rows and cause UPDATE/DELETE to silently affect zero rows
-- with no error. The SECURITY DEFINER helper bypasses that nested RLS and returns
-- the real prison_id, so USING/WITH CHECK evaluate reliably.
DROP POLICY IF EXISTS admin_inmate_relatives_prison ON inmate_relatives;
CREATE POLICY admin_inmate_relatives_prison ON inmate_relatives
  FOR ALL
  USING (
    fn_inmate_prison_id(inmate_relatives.inmate_id)::text = auth.jwt() ->> 'prison_id'
  )
  WITH CHECK (
    fn_inmate_prison_id(inmate_relatives.inmate_id)::text = auth.jwt() ->> 'prison_id'
  );
