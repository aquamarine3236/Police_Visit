-- Migration 00023: RPC nhập thân thích hàng loạt theo transaction
--
-- Requirement (mục 4 của yêu cầu)
-- -------------------------------
-- Import Excel thân thích. File chỉ cần các cột: Số giam, Họ và tên, Ngày sinh
-- (nullable), CCCD, Mối quan hệ. Khi import:
--   * Gom theo Số giam.
--   * Nếu Số giam không tồn tại -> báo lỗi rõ ràng.
--   * Không tạo dữ liệu trùng (dedup theo CCCD trong cùng người bị giam).
--   * Không cho vượt quá 10 thân thích/người.
--   * Thực hiện theo TRANSACTION để tránh nhập một phần khi có lỗi.
--
-- Thiết kế
-- --------
-- Tầng API (Next.js) chịu trách nhiệm: đọc/validate Excel, gom nhóm theo Số
-- giam, ánh xạ Số giam -> inmate_id, và loại các dòng sai định dạng. Sau đó gọi
-- RPC này MỘT LẦN với payload JSONB đã gom nhóm. RPC chạy toàn bộ INSERT trong
-- một transaction duy nhất (SECURITY DEFINER): nếu bất kỳ inmate nào vi phạm
-- (vượt 10 người) thì TOÀN BỘ được rollback.
--
-- Payload:
--   p_groups = [
--     { "inmate_id": "<uuid>",
--       "relatives": [ { full_name, date_of_birth, citizen_id, relationship } ] }
--   ]
--
-- Trả về:
--   { "imported": <int>, "skipped": <int> }   khi thành công
--   { "error": "LIMIT_EXCEEDED", "inmate_id": "<uuid>" }  khi 1 inmate vượt 10
--
-- Dedup: dùng ON CONFLICT (inmate_id, citizen_id) DO NOTHING -> các dòng trùng
-- CCCD (đã có sẵn hoặc lặp trong file) bị bỏ qua và đếm vào `skipped`.

CREATE OR REPLACE FUNCTION fn_bulk_import_relatives(
  p_groups JSONB,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group JSONB;
  v_inmate_id UUID;
  v_relative JSONB;
  v_existing_count INTEGER;
  v_incoming_count INTEGER;
  v_imported INTEGER := 0;
  v_skipped INTEGER := 0;
  v_inserted_id UUID;
BEGIN
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_groups)
  LOOP
    v_inmate_id := (v_group->>'inmate_id')::uuid;

    -- Số thân thích hiện có của người bị giam này.
    SELECT COUNT(*) INTO v_existing_count
    FROM inmate_relatives
    WHERE inmate_id = v_inmate_id;

    -- Số thân thích DUY NHẤT (theo CCCD) sắp thêm mà CHƯA tồn tại. Dùng để
    -- kiểm tra trần 10 người TRƯỚC khi insert, cho thông báo lỗi rõ ràng thay
    -- vì để trigger BEFORE INSERT bắn giữa chừng.
    SELECT COUNT(DISTINCT (rel->>'citizen_id')) INTO v_incoming_count
    FROM jsonb_array_elements(v_group->'relatives') AS rel
    WHERE NOT EXISTS (
      SELECT 1 FROM inmate_relatives ir
      WHERE ir.inmate_id = v_inmate_id
        AND ir.citizen_id = (rel->>'citizen_id')
    );

    IF v_existing_count + v_incoming_count > 10 THEN
      -- Ném lỗi -> rollback toàn bộ transaction (không nhập một phần).
      RAISE EXCEPTION 'LIMIT_EXCEEDED:%', v_inmate_id
        USING ERRCODE = 'check_violation';
    END IF;

    -- Insert từng thân thích, bỏ qua bản trùng CCCD.
    FOR v_relative IN SELECT * FROM jsonb_array_elements(v_group->'relatives')
    LOOP
      INSERT INTO inmate_relatives (
        inmate_id, full_name, date_of_birth, citizen_id, relationship,
        created_by, updated_by
      )
      VALUES (
        v_inmate_id,
        btrim(v_relative->>'full_name'),
        NULLIF(v_relative->>'date_of_birth', '')::date,
        v_relative->>'citizen_id',
        btrim(v_relative->>'relationship'),
        p_user_id,
        p_user_id
      )
      ON CONFLICT (inmate_id, citizen_id) DO NOTHING
      RETURNING id INTO v_inserted_id;

      IF v_inserted_id IS NULL THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_imported := v_imported + 1;
        v_inserted_id := NULL;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('imported', v_imported, 'skipped', v_skipped);
END;
$$;

-- Chỉ admin (authenticated) mới được gọi. Public (anon) không cần.
REVOKE ALL ON FUNCTION fn_bulk_import_relatives(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_bulk_import_relatives(JSONB, UUID) TO authenticated;
