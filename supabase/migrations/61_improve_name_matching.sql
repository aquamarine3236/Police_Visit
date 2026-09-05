-- ============================================================================
-- 61_improve_name_matching — Vietnamese name normalization for relative check
-- ============================================================================
-- Improves the name-matching logic in fn_submit_registration to handle:
--   * Case differences (Thủy ↔ THỦY)
--   * Vietnamese Unicode normalization (NFC vs NFD)
--   * Tone-mark placement variants (Thủy ↔ Thuỷ)
--   * Multiple whitespace between name components
--
-- Strategy: strip ALL diacritics by decomposing to NFD, removing combining
-- marks (U+0300–U+036F), replacing đ/Đ→d, lowercasing, and collapsing spaces.
-- This is safe because matching is scoped to a specific inmate's relative list
-- (max 10 entries).

-- ─── fn_normalize_vietnamese_name ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_normalize_vietnamese_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    -- 5. Collapse multiple spaces into one, trim
    btrim(regexp_replace(
      -- 4. Lowercase
      lower(
        -- 3. Replace đ/Đ (not decomposed by NFD)
        replace(replace(
          -- 2. Remove combining diacritical marks (U+0300–U+036F)
          regexp_replace(
            -- 1. NFD decompose (PostgreSQL 13+)
            normalize(p_name, NFD),
            '[\u0300-\u036f]', '', 'g'
          ),
        'đ', 'd'), 'Đ', 'D')
      ),
    '\s+', ' ', 'g'))
$$;

-- ─── Updated fn_submit_registration ─────────────────────────────────────────
-- Match visitors against inmate's approved relatives using:
--   * normalized full_name (Vietnamese diacritic-tolerant)
--   * date_of_birth (optional, NULL-safe)
--   * relationship (case-insensitive)
CREATE OR REPLACE FUNCTION fn_submit_registration(
  p_prison_id UUID,
  p_inmate_id UUID,
  p_visit_date DATE,
  p_visitors JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duplicate_count INTEGER;
  v_slot RECORD;
  v_registration visit_registrations%ROWTYPE;
  v_visitor JSONB;
  v_order INTEGER := 0;
  v_visitors JSONB := '[]'::jsonb;
  v_inserted registration_visitors%ROWTYPE;
  v_match_count INTEGER;
  v_invalid_positions INTEGER[] := ARRAY[]::INTEGER[];
  v_ambiguous_positions INTEGER[] := ARRAY[]::INTEGER[];
  v_visitor_date_of_birth DATE;
BEGIN
  -- ─── Relative check ───────────────────────────────────────────────────────
  -- Every visitor must match an entry in the inmate's approved-relatives list.
  -- Match on: normalized full_name + date_of_birth + relationship
  v_order := 0;
  FOR v_visitor IN SELECT * FROM jsonb_array_elements(p_visitors)
  LOOP
    v_order := v_order + 1;
    v_visitor_date_of_birth := NULLIF(v_visitor->>'date_of_birth', '')::date;

    SELECT COUNT(*) INTO v_match_count
    FROM inmate_relatives r
    WHERE r.inmate_id = p_inmate_id
      AND fn_normalize_vietnamese_name(r.full_name) = fn_normalize_vietnamese_name(v_visitor->>'full_name')
      AND r.date_of_birth IS NOT DISTINCT FROM v_visitor_date_of_birth
      AND lower(btrim(r.relationship)) = lower(btrim(v_visitor->>'relationship'));

    IF v_match_count = 0 THEN
      v_invalid_positions := array_append(v_invalid_positions, v_order);
    ELSIF v_match_count > 1 THEN
      v_ambiguous_positions := array_append(v_ambiguous_positions, v_order);
    END IF;
  END LOOP;

  IF array_length(v_ambiguous_positions, 1) > 0 THEN
    RETURN jsonb_build_object(
      'error', 'AMBIGUOUS_RELATIVE',
      'positions', to_jsonb(v_ambiguous_positions)
    );
  END IF;

  IF array_length(v_invalid_positions, 1) > 0 THEN
    RETURN jsonb_build_object(
      'error', 'NOT_RELATIVE',
      'positions', to_jsonb(v_invalid_positions)
    );
  END IF;

  -- ─── Duplicate prevention (BR-06) ─────────────────────────────────────────
  SELECT COUNT(*) INTO v_duplicate_count
  FROM visit_registrations vr
  WHERE vr.inmate_id = p_inmate_id
    AND vr.visit_date = p_visit_date
    AND vr.status IN ('confirmed', 'completed', 'no_show');

  IF v_duplicate_count > 0 THEN
    RETURN jsonb_build_object('error', 'DUPLICATE');
  END IF;

  -- Slot assignment (acquires advisory lock, checks monthly limit + capacity).
  SELECT * INTO v_slot
  FROM fn_assign_time_slot(p_prison_id, p_visit_date, p_inmate_id);

  IF v_slot IS NULL OR v_slot.slot_start IS NULL THEN
    -- Distinguish "monthly limit exceeded" from "no capacity left".
    IF NOT fn_check_monthly_visit_limit(p_inmate_id, p_visit_date) THEN
      RETURN jsonb_build_object('error', 'MONTHLY_LIMIT');
    END IF;
    RETURN jsonb_build_object('error', 'NO_SLOT');
  END IF;

  -- Insert the registration.
  INSERT INTO visit_registrations (
    prison_id, inmate_id, visit_date, time_slot_start, time_slot_end, status
  )
  VALUES (
    p_prison_id, p_inmate_id, p_visit_date, v_slot.slot_start, v_slot.slot_end, 'confirmed'
  )
  RETURNING * INTO v_registration;

  -- Insert visitors (1..3), preserving order.
  v_order := 0;
  FOR v_visitor IN SELECT * FROM jsonb_array_elements(p_visitors)
  LOOP
    v_order := v_order + 1;

    INSERT INTO registration_visitors (
      registration_id, full_name, date_of_birth, relationship, display_order
    )
    VALUES (
      v_registration.id,
      btrim(v_visitor->>'full_name'),
      NULLIF(v_visitor->>'date_of_birth', '')::date,
      btrim(v_visitor->>'relationship'),
      v_order
    )
    RETURNING * INTO v_inserted;

    v_visitors := v_visitors || to_jsonb(v_inserted);
  END LOOP;

  RETURN jsonb_build_object(
    'registration', to_jsonb(v_registration),
    'visitors', v_visitors
  );

EXCEPTION
  -- Safety net: if a concurrent transaction wins the race between the advisory
  -- lock release and this insert, the unique index raises unique_violation.
  -- Map it to the same DUPLICATE code the app already handles.
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'DUPLICATE');
END;
$$;

GRANT EXECUTE ON FUNCTION fn_submit_registration(UUID, UUID, DATE, JSONB)
  TO anon, authenticated;
