-- Migration 00005: Create registration_visitors table

CREATE TABLE IF NOT EXISTS registration_visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES visit_registrations(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  citizen_id VARCHAR(12) NOT NULL,
  relationship VARCHAR(100) NOT NULL,
  display_order SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT registration_visitors_display_order_check CHECK (display_order BETWEEN 1 AND 3)
);

CREATE INDEX IF NOT EXISTS idx_rv_registration ON registration_visitors(registration_id);
CREATE INDEX IF NOT EXISTS idx_rv_citizen_id ON registration_visitors(citizen_id);
