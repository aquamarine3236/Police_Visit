-- ============================================================================
-- 10_functions_util — Shared utility & audit functions
-- ============================================================================
-- Sources (merged):
--   00008_create_triggers_and_rls.sql   (fn_update_timestamp)
--   00013_create_audit_triggers.sql     (fn_audit_log)
--   00021_create_inmate_relatives.sql   (fn_audit_log_inmate_relatives)
--
-- The triggers that attach these functions to tables live in 20_triggers.sql.

-- ─── fn_update_timestamp ─────────────────────────────────────────────────────
-- Sets updated_at = now() on every UPDATE. Reused by all tables that have an
-- updated_at column.
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── fn_audit_log ────────────────────────────────────────────────────────────
-- Generic audit-trail writer for tables that expose a `prison_id` column.
-- SECURITY DEFINER so it can INSERT into audit_logs regardless of the caller's
-- RLS context. Best-effort: an audit failure RAISEs a WARNING but never rolls
-- back the underlying business operation.
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

-- ─── fn_audit_log_inmate_relatives ──────────────────────────────────────────
-- inmate_relatives has NO prison_id column, so it cannot use fn_audit_log
-- directly. This variant derives prison_id from the parent inmates row.
CREATE OR REPLACE FUNCTION fn_audit_log_inmate_relatives()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_values JSONB;
  v_new_values JSONB;
  v_record_id  UUID;
  v_inmate_id  UUID;
  v_prison_id  UUID;
  v_user_id    UUID;
BEGIN
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF (TG_OP = 'DELETE') THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
    v_record_id  := OLD.id;
    v_inmate_id  := OLD.inmate_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    v_record_id  := NEW.id;
    v_inmate_id  := NEW.inmate_id;
  ELSE -- INSERT
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
    v_record_id  := NEW.id;
    v_inmate_id  := NEW.inmate_id;
  END IF;

  SELECT prison_id INTO v_prison_id FROM inmates WHERE id = v_inmate_id;

  INSERT INTO audit_logs (
    prison_id, user_id, action, table_name, record_id, old_values, new_values
  ) VALUES (
    v_prison_id, v_user_id, TG_OP, TG_TABLE_NAME, v_record_id, v_old_values, v_new_values
  );

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_audit_log_inmate_relatives failed for % : %', TG_OP, SQLERRM;
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
