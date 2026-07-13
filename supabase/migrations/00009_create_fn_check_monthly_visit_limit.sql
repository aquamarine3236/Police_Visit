-- Migration 00009: Create fn_check_monthly_visit_limit

CREATE OR REPLACE FUNCTION fn_check_monthly_visit_limit(
  p_inmate_id UUID,
  p_visit_date DATE
)
RETURNS BOOLEAN LANGUAGE sql AS $$
WITH inmate_data AS (
  SELECT classification
  FROM inmates
  WHERE id = p_inmate_id
), counted AS (
  SELECT COUNT(*) AS visit_count
  FROM visit_registrations vr
  WHERE vr.inmate_id = p_inmate_id
    AND vr.visit_date >= date_trunc('month', p_visit_date)::date
    AND vr.visit_date < (date_trunc('month', p_visit_date) + INTERVAL '1 month')::date
    AND vr.status IN ('confirmed', 'completed', 'no_show')
)
SELECT
  CASE
    WHEN classification = 'Người bị tạm giữ' THEN counted.visit_count < 2
    ELSE counted.visit_count < 1
  END
FROM inmate_data, counted;
$$;
