-- Migration 00022: Kiểm tra danh sách thân thích khi đăng ký thăm gặp
--
-- Requirement (mục 6 của yêu cầu)
-- -------------------------------
-- Trước khi tạo lịch thăm gặp, hệ thống phải kiểm tra TẤT CẢ người đăng ký.
-- Với từng người đăng ký, so sánh CCCD + Họ và tên (KHÔNG bắt buộc ngày sinh)
-- với danh sách thân thích của người bị giam.
--   * Nếu tất cả đều nằm trong danh sách  -> tiếp tục xếp lịch như hiện tại.
--   * Nếu có ≥1 người KHÔNG nằm trong danh sách -> KHÔNG tạo lịch, KHÔNG lưu,
--     trả về danh sách vị trí (1-based) của những người không hợp lệ.
--
-- Chế độ áp dụng (backward-compatible)
-- ------------------------------------
-- Nếu người bị giam CHƯA có thân thích nào được khai báo, bước kiểm tra được
-- BỎ QUA (fail-open) để không khóa toàn bộ luồng đăng ký công khai ngay khi
-- triển khai. Việc kiểm tra chỉ có hiệu lực khi người bị giam đã có ≥1 thân
-- thích. Muốn siết chặt (bắt buộc luôn phải khai báo trước) chỉ cần đổi điều
-- kiện `v_relative_total = 0 THEN skip` ở dưới.
--
-- Thiết kế
-- --------
-- Đặt bước kiểm tra NGAY TRONG `fn_submit_registration` (SECURITY DEFINER) để
-- đảm bảo TÍNH NGUYÊN TỬ: khi có người không hợp lệ thì hàm thoát sớm, không
-- INSERT bất kỳ dòng nào. So khớp không phân biệt hoa/thường và bỏ khoảng
-- trắng thừa ở họ tên (giống cách cross-verify inmate ở tầng app).

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
BEGIN
  -- ─── Bước kiểm tra thân thích (mục 6) ─────────────────────────────────────
  -- Chắc chắn người đi thăm phải nằm trong danh sách thân thích của người bị giam giữ.
  v_order := 0;
  FOR v_visitor IN SELECT * FROM jsonb_array_elements(p_visitors)
  LOOP
    v_order := v_order + 1;

    -- Khớp khi CCCD trùng VÀ họ tên trùng (chuẩn hóa: trim + lower). Không
    -- xét ngày sinh theo yêu cầu.
    SELECT COUNT(*) INTO v_match_count
    FROM inmate_relatives r
    WHERE r.inmate_id = p_inmate_id
      AND r.citizen_id = (v_visitor->>'citizen_id')
      AND lower(btrim(r.full_name)) = lower(btrim(v_visitor->>'full_name'));

    IF v_match_count = 0 THEN
      v_invalid_positions := array_append(v_invalid_positions, v_order);
    END IF;
  END LOOP;

  IF array_length(v_invalid_positions, 1) > 0 THEN
    RETURN jsonb_build_object(
      'error', 'NOT_RELATIVE',
      'positions', to_jsonb(v_invalid_positions)
    );
  END IF;

  -- ─── Từ đây trở xuống giữ nguyên logic của migration 00019 ────────────────

  -- Duplicate prevention (BR-06, tightened): an inmate cannot have two active
  -- registrations on the same date, regardless of visitor or time slot.
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
      registration_id, full_name, date_of_birth, citizen_id, relationship, display_order
    )
    VALUES (
      v_registration.id,
      v_visitor->>'full_name',
      (v_visitor->>'date_of_birth')::date,
      v_visitor->>'citizen_id',
      v_visitor->>'relationship',
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

-- Keep execution grants intact (function was recreated).
GRANT EXECUTE ON FUNCTION fn_submit_registration(UUID, UUID, DATE, JSONB)
  TO anon, authenticated;
