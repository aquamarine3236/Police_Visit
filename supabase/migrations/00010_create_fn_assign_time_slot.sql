-- Migration 00010: Create fn_assign_time_slot

CREATE OR REPLACE FUNCTION fn_assign_time_slot(
  p_prison_id UUID,
  p_visit_date DATE,
  p_inmate_id UUID
)
RETURNS TABLE(slot_start TIME, slot_end TIME)
LANGUAGE plpgsql AS $$
DECLARE
  slot_duration INTEGER;
  current_start TIME;
  settings RECORD;
  slot_counts RECORD;
  slot_record RECORD;
BEGIN
  SELECT * INTO settings
  FROM scheduling_settings
  WHERE prison_id = p_prison_id;

  IF settings IS NULL THEN
    RETURN;
  END IF;

  IF NOT fn_check_monthly_visit_limit(p_inmate_id, p_visit_date) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_prison_id::text || p_visit_date::text));

  FOR slot_record IN
    SELECT slot_start, slot_end
    FROM (
      SELECT morning.slot_start
      FROM (
        SELECT generate_series(
          settings.morning_start_time,
          settings.morning_end_time - (settings.visit_time || ' minutes')::interval,
          (settings.visit_time || ' minutes')::interval
        ) AS slot_start
      ) AS morning
      UNION ALL
      SELECT afternoon.slot_start
      FROM (
        SELECT generate_series(
          settings.afternoon_start_time,
          settings.afternoon_end_time - (settings.visit_time || ' minutes')::interval,
          (settings.visit_time || ' minutes')::interval
        ) AS slot_start
      ) AS afternoon
    ) AS slots
    CROSS JOIN LATERAL (
      SELECT slots.slot_start + (settings.visit_time || ' minutes')::interval AS slot_end
    ) AS slot_end_calc
    ORDER BY slot_start
  LOOP
    SELECT COUNT(*) AS count INTO slot_counts
    FROM visit_registrations
    WHERE prison_id = p_prison_id
      AND visit_date = p_visit_date
      AND time_slot_start = slot_record.slot_start
      AND status IN ('confirmed', 'completed', 'no_show');

    IF slot_counts.count < settings.max_visit_per_time THEN
      slot_start := slot_record.slot_start;
      slot_end := slot_record.slot_end;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END;
$$;
