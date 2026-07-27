-- ============================================================================
-- 20_triggers — Timestamp + audit triggers for all tables
-- ============================================================================
-- Sources (merged):
--   00008_create_triggers_and_rls.sql   (updated_at triggers)
--   00013_create_audit_triggers.sql     (audit triggers)
--   00021_create_inmate_relatives.sql   (inmate_relatives timestamp + audit)
--
-- The trigger FUNCTIONS live in 10_functions_util.sql. The table-specific
-- max-10 trigger for inmate_relatives lives in 08_inmate_relatives.sql.

-- ─── updated_at triggers (fn_update_timestamp) ──────────────────────────────
DROP TRIGGER IF EXISTS trg_update_timestamp_prisons ON prisons;
CREATE TRIGGER trg_update_timestamp_prisons
BEFORE UPDATE ON prisons
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_update_timestamp_admin_profiles ON admin_profiles;
CREATE TRIGGER trg_update_timestamp_admin_profiles
BEFORE UPDATE ON admin_profiles
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_update_timestamp_inmates ON inmates;
CREATE TRIGGER trg_update_timestamp_inmates
BEFORE UPDATE ON inmates
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_update_timestamp_visit_registrations ON visit_registrations;
CREATE TRIGGER trg_update_timestamp_visit_registrations
BEFORE UPDATE ON visit_registrations
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_update_timestamp_scheduling_settings ON scheduling_settings;
CREATE TRIGGER trg_update_timestamp_scheduling_settings
BEFORE UPDATE ON scheduling_settings
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_update_timestamp_inmate_relatives ON inmate_relatives;
CREATE TRIGGER trg_update_timestamp_inmate_relatives
BEFORE UPDATE ON inmate_relatives
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── Audit triggers (fn_audit_log) ──────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_inmates ON inmates;
CREATE TRIGGER trg_audit_inmates
AFTER INSERT OR UPDATE OR DELETE ON inmates
FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_visit_registrations ON visit_registrations;
CREATE TRIGGER trg_audit_visit_registrations
AFTER INSERT OR UPDATE OR DELETE ON visit_registrations
FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_scheduling_settings ON scheduling_settings;
CREATE TRIGGER trg_audit_scheduling_settings
AFTER INSERT OR UPDATE OR DELETE ON scheduling_settings
FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- inmate_relatives has no prison_id column → uses the specialized audit fn.
DROP TRIGGER IF EXISTS trg_audit_inmate_relatives ON inmate_relatives;
CREATE TRIGGER trg_audit_inmate_relatives
AFTER INSERT OR UPDATE OR DELETE ON inmate_relatives
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_inmate_relatives();
