-- ============================================================================
-- 03_inmates — Inmates (người bị giam giữ) — FINAL consolidated schema
-- ============================================================================
-- Sources (merged):
--   00003_create_inmates.sql                    (base table + indexes)
--   00020_make_date_of_birth_nullable.sql        (date_of_birth NULL)
--   00024_add_death_sentence_classification.sql  (4-value classification CHECK
--                                                 + classification_changed_at)
--   00026_rename_visit_status_available.sql      (visit_status = 'Được thăm gặp')
--
-- Final state notes:
--   * date_of_birth is NULLABLE.
--   * classification CHECK allows the four current values, including
--     'Người bị kết án tử hình'.
--   * classification_changed_at tracks when classification last changed; the
--     "Người bị tạm giữ" total-visit limit is counted from this timestamp
--     (see fn_check_monthly_visit_limit in 12_functions_scheduling.sql).
--   * visit_status default + CHECK use the renamed value 'Được thăm gặp'.
--     (The old value 'Có thể thăm gặp' no longer exists anywhere.)

CREATE TABLE IF NOT EXISTS inmates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prison_id UUID NOT NULL REFERENCES prisons(id) ON DELETE CASCADE,
  prison_number VARCHAR(50) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NULL,
  citizen_id VARCHAR(12) NULL,
  permanent_address TEXT NULL,
  criminal_offense TEXT NULL,
  arrest_date DATE NULL,
  admission_date DATE NULL,
  classification VARCHAR(50) NOT NULL,
  classification_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  visit_status VARCHAR(50) NOT NULL DEFAULT 'Được thăm gặp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_by UUID NULL,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT inmates_classification_check CHECK (classification IN (
    'Người bị tạm giữ',
    'Người bị tạm giam',
    'Người bị kết án tử hình',
    'Phạm nhân'
  )),
  CONSTRAINT inmates_visit_status_check CHECK (visit_status IN (
    'Được thăm gặp',
    'Hạn chế thăm gặp'
  ))
);

-- Unique active prison number per prison (soft-deleted rows excluded).
CREATE UNIQUE INDEX IF NOT EXISTS idx_inmates_prison_number_active
  ON inmates(prison_id, prison_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inmates_deleted_at ON inmates(deleted_at);
CREATE INDEX IF NOT EXISTS idx_inmates_classification ON inmates(prison_id, classification);
