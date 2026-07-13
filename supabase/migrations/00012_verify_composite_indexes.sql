-- Migration 00012: Verify composite indexes (Phase 36 — Performance Optimization)
--
-- This migration re-asserts the composite indexes that back the system's hot
-- read paths. All statements use `CREATE INDEX IF NOT EXISTS`, so this migration
-- is idempotent and safe to run against a database that already has them (from
-- migrations 00001-00007). It serves as an explicit "indexes validation
-- checkup" ensuring every performance-critical query leverages a composite
-- index rather than a sequential scan.
--
-- Hot query → index mapping:
--   • Admin registrations list / scheduling lookups
--       WHERE prison_id = ? AND visit_date = ? [AND time_slot_start = ?]
--       AND status IN (...)                              → idx_vr_scheduling
--   • Monthly visit-limit checks (fn_check_monthly_visit_limit)
--       WHERE inmate_id = ? AND visit_date BETWEEN ? AND ?
--       AND status IN (...)                              → idx_vr_inmate_month
--   • Dashboard "recent registrations" ordering
--       ORDER BY created_at DESC                          → idx_vr_created_at
--   • Status filtering                                    → idx_vr_status
--   • Inmate lookup during registration
--       WHERE prison_id = ? AND prison_number = ?
--       AND deleted_at IS NULL                            → idx_inmates_prison_number_active
--   • Inmate classification filtering
--       WHERE prison_id = ? AND classification = ?        → idx_inmates_classification
--   • Visitor duplicate lookups
--       WHERE citizen_id = ?                              → idx_rv_citizen_id
--   • Scheduling settings read (public + admin)
--       WHERE prison_id = ?                               → idx_ss_prison_id
--
-- To validate at runtime, run e.g.:
--   EXPLAIN ANALYZE
--   SELECT * FROM visit_registrations
--   WHERE prison_id = '11111111-1111-1111-1111-111111111111'
--     AND visit_date = CURRENT_DATE
--     AND status IN ('confirmed', 'completed', 'no_show');
-- and confirm the plan shows "Index Scan using idx_vr_scheduling".

-- ─── visit_registrations ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vr_scheduling
  ON visit_registrations(prison_id, visit_date, time_slot_start, status);
CREATE INDEX IF NOT EXISTS idx_vr_inmate_month
  ON visit_registrations(inmate_id, visit_date, status);
CREATE INDEX IF NOT EXISTS idx_vr_status
  ON visit_registrations(status);
CREATE INDEX IF NOT EXISTS idx_vr_created_at
  ON visit_registrations(created_at DESC);

-- ─── inmates ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_inmates_prison_number_active
  ON inmates(prison_id, prison_number)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inmates_classification
  ON inmates(prison_id, classification);
CREATE INDEX IF NOT EXISTS idx_inmates_deleted_at
  ON inmates(deleted_at);

-- ─── registration_visitors ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rv_registration
  ON registration_visitors(registration_id);
CREATE INDEX IF NOT EXISTS idx_rv_citizen_id
  ON registration_visitors(citizen_id);

-- ─── scheduling_settings ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ss_prison_id
  ON scheduling_settings(prison_id);

-- Refresh planner statistics so the query planner picks up the (re-)validated
-- indexes immediately.
ANALYZE visit_registrations;
ANALYZE inmates;
ANALYZE registration_visitors;
ANALYZE scheduling_settings;
