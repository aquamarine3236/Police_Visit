-- ============================================================================
-- 07_audit_logs — Immutable audit trail for mutations
-- ============================================================================
-- Source (merged): 00007_create_audit_logs.sql
--
-- Rows are written exclusively by the SECURITY DEFINER audit trigger functions
-- (see 10_functions_util.sql / 20_triggers.sql). There is intentionally NO
-- public/admin INSERT policy — only an admin SELECT policy (see 30_rls.sql).

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prison_id UUID NULL REFERENCES prisons(id) ON DELETE SET NULL,
  user_id UUID NULL,
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NULL,
  old_values JSONB NULL,
  new_values JSONB NULL,
  ip_address INET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_al_table_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_al_created_at ON audit_logs(created_at DESC);
