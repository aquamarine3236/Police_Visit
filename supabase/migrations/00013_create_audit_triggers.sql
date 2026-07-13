-- Migration 00013: Audit-log triggers (Phase 39)
--
-- Records every INSERT / UPDATE / DELETE on the monitored tables into
-- `audit_logs` (created in migration 00007). Implemented as database triggers
-- (per docs/12-security.md §12.10) so that ALL mutation paths are covered
-- uniformly — Server Actions, Excel imports, and direct SQL alike.
--
-- Design notes:
--   * The function is SECURITY DEFINER so it can INSERT into `audit_logs`
--     regardless of the caller's RLS context (audit_logs only exposes an admin
--     SELECT policy — there is intentionally no INSERT policy).
--   * The whole body is wrapped in an exception handler that RAISEs a WARNING
--     but never re-raises, so an audit failure can never roll back or block the
--     underlying business operation ("audit is best-effort, never fatal").
--   * `prison_id` and `record_id` are read generically from the changed row so
--     the same function serves every monitored table.

CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_values JSONB;
  v_new_values JSONB;
  v_record_id  UUID;
  v_prison_id  UUID;
  v_user_id    UUID;
BEGIN
  -- Capture the authenticated user (NULL for anonymous / system operations).
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF (TG_OP = 'DELETE') THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
    v_record_id  := OLD.id;
    v_prison_id  := OLD.prison_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    v_record_id  := NEW.id;
    v_prison_id  := NEW.prison_id;
  ELSE -- INSERT
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
    v_record_id  := NEW.id;
    v_prison_id  := NEW.prison_id;
  END IF;

  INSERT INTO audit_logs (
    prison_id,
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    v_prison_id,
    v_user_id,
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_old_values,
    v_new_values
  );

  -- The return value is ignored for AFTER triggers, but returning the row
  -- keeps the function valid for either firing time.
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Audit logging must never break the primary operation.
  RAISE WARNING 'fn_audit_log failed for % on %: %', TG_OP, TG_TABLE_NAME, SQLERRM;
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── inmates ────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_inmates ON inmates;
CREATE TRIGGER trg_audit_inmates
AFTER INSERT OR UPDATE OR DELETE ON inmates
FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- ─── visit_registrations ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_visit_registrations ON visit_registrations;
CREATE TRIGGER trg_audit_visit_registrations
AFTER INSERT OR UPDATE OR DELETE ON visit_registrations
FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- ─── scheduling_settings ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_scheduling_settings ON scheduling_settings;
CREATE TRIGGER trg_audit_scheduling_settings
AFTER INSERT OR UPDATE OR DELETE ON scheduling_settings
FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
