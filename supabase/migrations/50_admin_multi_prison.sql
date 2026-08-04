-- ============================================================================
-- 50_admin_multi_prison — Multi-prison admin assignments + super_admin support
-- ============================================================================
-- New feature set:
--   * An admin can be assigned to MULTIPLE prisons by a super admin.
--     `admin_profiles.prison_id` remains the *ACTIVE* prison (everything that
--     scopes by prison — services, RLS via the JWT `prison_id` claim — keeps
--     working unchanged). The new `admin_prison_assignments` table records
--     which prisons the admin is ALLOWED to switch to.
--   * `super_admin` users manage admins/prisons only and have NO prison of
--     their own, so `prison_id` becomes nullable (guarded by a CHECK so a
--     regular admin can never end up prison-less).
--
-- This migration is purely ADDITIVE — it does not modify any of the
-- consolidated schema files (00–40). It applies after them by filename order.

-- ─── admin_profiles.prison_id → nullable (super_admin only) ─────────────────
ALTER TABLE admin_profiles
  ALTER COLUMN prison_id DROP NOT NULL;

-- A regular admin must always have an active prison; only super_admin may be
-- prison-less.
ALTER TABLE admin_profiles
  DROP CONSTRAINT IF EXISTS admin_profiles_prison_required_check;
ALTER TABLE admin_profiles
  ADD CONSTRAINT admin_profiles_prison_required_check
  CHECK (role = 'super_admin' OR prison_id IS NOT NULL);

-- ─── admin_prison_assignments — which prisons an admin may access ────────────
CREATE TABLE IF NOT EXISTS admin_prison_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_profiles(id) ON DELETE CASCADE,
  prison_id UUID NOT NULL REFERENCES prisons(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  CONSTRAINT uq_admin_prison_assignment UNIQUE (admin_id, prison_id)
);

CREATE INDEX IF NOT EXISTS idx_apa_admin_id  ON admin_prison_assignments(admin_id);
CREATE INDEX IF NOT EXISTS idx_apa_prison_id ON admin_prison_assignments(prison_id);

-- ─── Backfill: every existing admin keeps access to their current prison ─────
INSERT INTO admin_prison_assignments (admin_id, prison_id)
SELECT ap.id, ap.prison_id
FROM admin_profiles ap
WHERE ap.prison_id IS NOT NULL
ON CONFLICT (admin_id, prison_id) DO NOTHING;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Reads: an admin may see their own assignment rows (used by the profile page
-- to list switchable prisons). ALL writes happen through SECURITY DEFINER RPCs
-- (51_functions_admin_profile.sql) — no INSERT/UPDATE/DELETE policies exist,
-- so direct writes are denied for every API role.
ALTER TABLE admin_prison_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_prison_assignments_self_read ON admin_prison_assignments;
CREATE POLICY admin_prison_assignments_self_read ON admin_prison_assignments
  FOR SELECT
  USING (admin_id = auth.uid());

-- Admins need to read the prisons they are assigned to (names/codes for the
-- switcher UI). The existing `admin_prisons_all` policy only exposes the
-- active prison (JWT claim), so add a read policy scoped through assignments.
DROP POLICY IF EXISTS admin_prisons_assigned_read ON prisons;
CREATE POLICY admin_prisons_assigned_read ON prisons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM admin_prison_assignments apa
      WHERE apa.prison_id = prisons.id
        AND apa.admin_id = auth.uid()
    )
  );

-- ─── updated_at guard ────────────────────────────────────────────────────────
-- (Assignments are immutable rows — created/deleted, never updated — so no
--  updated_at trigger is required.)
