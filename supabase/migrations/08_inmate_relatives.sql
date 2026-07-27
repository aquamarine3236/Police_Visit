-- ============================================================================
-- 08_inmate_relatives — Approved relatives (thân thích) per inmate (max 10)
-- ============================================================================
-- Source (merged): 00021_create_inmate_relatives.sql
--
-- This file defines ONLY the table, its indexes, and the max-10 enforcement
-- trigger that is intrinsic to the table's invariant. The shared timestamp
-- trigger, the audit function/trigger, and the RLS policy are defined in the
-- centralized files:
--   * fn_check_inmate_relatives_limit  → here (table-specific invariant)
--   * fn_update_timestamp trigger      → 20_triggers.sql
--   * fn_audit_log_inmate_relatives    → 10_functions_util.sql
--   * audit trigger                    → 20_triggers.sql
--   * admin_inmate_relatives_prison    → 30_rls.sql
--
-- Design notes:
--   * inmate_id FK ON DELETE CASCADE (hard-deleting an inmate removes relatives;
--     inmates are normally soft-deleted so data is retained in practice).
--   * UNIQUE (inmate_id, citizen_id) prevents duplicate CCCD per inmate (used
--     for dedup on manual add and bulk import).
--   * Max 10 relatives per inmate enforced at the DB layer via a BEFORE INSERT
--     trigger (last line of defence against races), alongside service-layer checks.

CREATE TABLE IF NOT EXISTS inmate_relatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inmate_id UUID NOT NULL REFERENCES inmates(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NULL,
  citizen_id VARCHAR(12) NOT NULL,
  relationship VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_by UUID NULL,
  CONSTRAINT inmate_relatives_citizen_id_check CHECK (citizen_id ~ '^[0-9]{12}$')
);

CREATE INDEX IF NOT EXISTS idx_inmate_relatives_inmate
  ON inmate_relatives(inmate_id);

CREATE INDEX IF NOT EXISTS idx_inmate_relatives_citizen_id
  ON inmate_relatives(citizen_id);

-- Prevent duplicate CCCD within the same inmate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inmate_relatives_inmate_citizen
  ON inmate_relatives(inmate_id, citizen_id);

-- ─── Max-10 relatives enforcement (BEFORE INSERT) ───────────────────────────
CREATE OR REPLACE FUNCTION fn_check_inmate_relatives_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM inmate_relatives
  WHERE inmate_id = NEW.inmate_id;

  IF v_count >= 10 THEN
    RAISE EXCEPTION 'Mỗi người bị giam giữ chỉ được tối đa 10 thân thích.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_inmate_relatives_limit ON inmate_relatives;
CREATE TRIGGER trg_check_inmate_relatives_limit
BEFORE INSERT ON inmate_relatives
FOR EACH ROW EXECUTE FUNCTION fn_check_inmate_relatives_limit();
