-- Migration 00008: Create triggers and row level security policies

CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_timestamp_prisons
BEFORE UPDATE ON prisons
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_update_timestamp_admin_profiles
BEFORE UPDATE ON admin_profiles
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_update_timestamp_inmates
BEFORE UPDATE ON inmates
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_update_timestamp_visit_registrations
BEFORE UPDATE ON visit_registrations
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_update_timestamp_scheduling_settings
BEFORE UPDATE ON scheduling_settings
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

ALTER TABLE prisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inmates ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for admin access to prison-scoped data
CREATE POLICY admin_prisons_all ON prisons
  FOR ALL
  USING (id::text = auth.jwt() ->> 'prison_id')
  WITH CHECK (id::text = auth.jwt() ->> 'prison_id');

CREATE POLICY admin_profiles_self ON admin_profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY admin_inmates_prison ON inmates
  FOR ALL
  USING (prison_id::text = auth.jwt() ->> 'prison_id')
  WITH CHECK (prison_id::text = auth.jwt() ->> 'prison_id');

CREATE POLICY public_inmates_read ON inmates
  FOR SELECT
  USING (deleted_at IS NULL AND visit_status = 'Có thể thăm gặp');

CREATE POLICY admin_visit_registrations_prison ON visit_registrations
  FOR ALL
  USING (prison_id::text = auth.jwt() ->> 'prison_id')
  WITH CHECK (prison_id::text = auth.jwt() ->> 'prison_id');

CREATE POLICY public_visit_registrations_insert ON visit_registrations
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY admin_settings_prison ON scheduling_settings
  FOR ALL
  USING (prison_id::text = auth.jwt() ->> 'prison_id')
  WITH CHECK (prison_id::text = auth.jwt() ->> 'prison_id');

CREATE POLICY public_settings_read ON scheduling_settings
  FOR SELECT
  USING (true);

CREATE POLICY admin_audit_logs_prison ON audit_logs
  FOR SELECT
  USING (prison_id::text = auth.jwt() ->> 'prison_id');
