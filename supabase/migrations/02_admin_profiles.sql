-- ============================================================================
-- 02_admin_profiles — Admin user profiles (linked 1:1 to Supabase Auth users)
-- ============================================================================
-- Source (merged): 00002_create_admin_profiles.sql
--
-- `id` matches the Supabase Auth user id. Passwords are managed by Supabase
-- Auth; this table only holds application-level profile + role + prison scope.

CREATE TABLE IF NOT EXISTS admin_profiles (
  id UUID PRIMARY KEY,
  prison_id UUID NOT NULL REFERENCES prisons(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_by UUID NULL,
  CONSTRAINT admin_profiles_role_check CHECK (role IN ('admin', 'super_admin'))
);

CREATE INDEX IF NOT EXISTS idx_admin_profiles_prison_id ON admin_profiles(prison_id);
CREATE INDEX IF NOT EXISTS idx_admin_profiles_is_active ON admin_profiles(is_active);
