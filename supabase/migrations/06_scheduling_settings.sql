-- ============================================================================
-- 06_scheduling_settings — Per-prison scheduling configuration
-- ============================================================================
-- Source (merged): 00006_create_scheduling_settings.sql

CREATE TABLE IF NOT EXISTS scheduling_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prison_id UUID NOT NULL UNIQUE REFERENCES prisons(id) ON DELETE CASCADE,
  visit_time INTEGER NOT NULL DEFAULT 30,
  morning_start_time TIME NOT NULL DEFAULT '07:30',
  morning_end_time TIME NOT NULL DEFAULT '11:30',
  afternoon_start_time TIME NOT NULL DEFAULT '13:30',
  afternoon_end_time TIME NOT NULL DEFAULT '17:30',
  max_visit_per_time INTEGER NOT NULL DEFAULT 2,
  suitable_days INTEGER[] NOT NULL DEFAULT '{4,5}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  CONSTRAINT scheduling_settings_visit_time_check CHECK (visit_time BETWEEN 10 AND 120),
  CONSTRAINT scheduling_settings_max_visit_per_time_check CHECK (max_visit_per_time BETWEEN 1 AND 10),
  CONSTRAINT scheduling_settings_morning_order_check CHECK (morning_start_time < morning_end_time),
  CONSTRAINT scheduling_settings_afternoon_order_check CHECK (afternoon_start_time < afternoon_end_time),
  CONSTRAINT scheduling_settings_session_order_check CHECK (morning_end_time <= afternoon_start_time)
);

CREATE INDEX IF NOT EXISTS idx_ss_prison_id ON scheduling_settings(prison_id);
