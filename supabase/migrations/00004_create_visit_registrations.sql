-- Migration 00004: Create visit_registrations table

CREATE TABLE IF NOT EXISTS visit_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prison_id UUID NOT NULL REFERENCES prisons(id) ON DELETE CASCADE,
  inmate_id UUID NOT NULL REFERENCES inmates(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  time_slot_start TIME NOT NULL,
  time_slot_end TIME NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  CONSTRAINT visit_registrations_status_check CHECK (status IN ('confirmed', 'completed', 'no_show')),
  CONSTRAINT visit_registrations_time_order_check CHECK (time_slot_start < time_slot_end)
);

CREATE INDEX IF NOT EXISTS idx_vr_scheduling ON visit_registrations(prison_id, visit_date, time_slot_start, status);
CREATE INDEX IF NOT EXISTS idx_vr_inmate_month ON visit_registrations(inmate_id, visit_date, status);
CREATE INDEX IF NOT EXISTS idx_vr_status ON visit_registrations(status);
CREATE INDEX IF NOT EXISTS idx_vr_created_at ON visit_registrations(created_at DESC);
