-- Migration 00003: Create inmates table

CREATE TABLE IF NOT EXISTS inmates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prison_id UUID NOT NULL REFERENCES prisons(id) ON DELETE CASCADE,
  prison_number VARCHAR(50) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  citizen_id VARCHAR(12) NULL,
  permanent_address TEXT NULL,
  criminal_offense TEXT NULL,
  arrest_date DATE NULL,
  admission_date DATE NULL,
  classification VARCHAR(50) NOT NULL,
  visit_status VARCHAR(50) NOT NULL DEFAULT 'Có thể thăm gặp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_by UUID NULL,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT inmates_classification_check CHECK (classification IN ('Người bị tạm giữ', 'Người bị tạm giam', 'Phạm nhân')),
  CONSTRAINT inmates_visit_status_check CHECK (visit_status IN ('Có thể thăm gặp', 'Hạn chế thăm gặp'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inmates_prison_number_active
  ON inmates(prison_id, prison_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inmates_deleted_at ON inmates(deleted_at);
CREATE INDEX IF NOT EXISTS idx_inmates_classification ON inmates(prison_id, classification);
