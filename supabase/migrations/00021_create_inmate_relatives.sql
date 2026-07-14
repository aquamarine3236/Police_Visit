-- Migration 00021: Create inmate_relatives table (Thân nhân người bị giam giữ)
--
-- Requirement
-- -----------
-- Quản lý danh sách người thân thích được phép đăng ký thăm gặp của từng người
-- bị giam giữ. Mỗi người bị giam có tối đa 10 thân thích. Thông tin lưu:
--   - Họ và tên
--   - Ngày sinh (nullable)
--   - CCCD
--   - Mối quan hệ
-- Thông tin người bị giam KHÔNG lưu lặp lại (đã có bảng `inmates`), chỉ tham
-- chiếu qua khóa ngoại `inmate_id`.
--
-- Design notes
-- ------------
--   * `inmate_id` FK ON DELETE CASCADE: xóa cứng người bị giam sẽ xóa luôn thân
--     thích. (Người bị giam thường chỉ soft-delete nên dữ liệu vẫn giữ.)
--   * UNIQUE (inmate_id, citizen_id): chống trùng CCCD trong cùng một người bị
--     giam (phục vụ dedup khi import và thêm thủ công).
--   * Giới hạn tối đa 10 thân thích được enforce ở TẦNG DATABASE bằng trigger
--     BEFORE INSERT (là lớp phòng thủ cuối cùng chống race), song song với kiểm
--     tra ở tầng service.
--   * RLS: admin chỉ thao tác được thân thích của người bị giam thuộc đúng
--     `prison_id` của mình (JOIN sang `inmates`), giống policy của
--     `registration_visitors` (migration 00015).

-- ─── 1. Table ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inmate_relatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inmate_id UUID NOT NULL REFERENCES inmates(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NULL,
  citizen_id VARCHAR(12) NOT NULL,
  relationship VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_by UUID NULL,
  CONSTRAINT inmate_relatives_citizen_id_check CHECK (citizen_id ~ '^[0-9]{12}$')
);

-- ─── 2. Indexes ─────────────────────────────────────────────────────────────
-- Tra cứu theo người bị giam (màn hình admin) và theo CCCD (bước kiểm tra khi
-- đăng ký thăm gặp) là các truy vấn thường xuyên nhất.

CREATE INDEX IF NOT EXISTS idx_inmate_relatives_inmate
  ON inmate_relatives(inmate_id);

CREATE INDEX IF NOT EXISTS idx_inmate_relatives_citizen_id
  ON inmate_relatives(citizen_id);

-- Chống trùng CCCD trong cùng một người bị giam.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inmate_relatives_inmate_citizen
  ON inmate_relatives(inmate_id, citizen_id);

-- ─── 3. updated_at trigger ──────────────────────────────────────────────────
-- Dùng lại hàm dùng chung `fn_update_timestamp` (migration 00008).

DROP TRIGGER IF EXISTS trg_update_timestamp_inmate_relatives ON inmate_relatives;
CREATE TRIGGER trg_update_timestamp_inmate_relatives
BEFORE UPDATE ON inmate_relatives
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── 4. Max-10 relatives trigger ────────────────────────────────────────────
-- Lớp phòng thủ cuối cùng: từ chối INSERT khiến số thân thích của một người bị
-- giam vượt quá 10 (kể cả khi hai request chạy đồng thời).

CREATE OR REPLACE FUNCTION fn_check_inmate_relatives_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM inmate_relatives
  WHERE inmate_id = NEW.inmate_id;

  IF v_count >= 10 THEN
    RAISE EXCEPTION 'Mỗi người bị giam giữ chỉ được tối đa 10 thân thích.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_inmate_relatives_limit ON inmate_relatives;
CREATE TRIGGER trg_check_inmate_relatives_limit
BEFORE INSERT ON inmate_relatives
FOR EACH ROW EXECUTE FUNCTION fn_check_inmate_relatives_limit();

-- ─── 5. Row Level Security ──────────────────────────────────────────────────
-- Admin chỉ truy cập thân thích của người bị giam thuộc đúng prison của mình.

ALTER TABLE inmate_relatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_inmate_relatives_prison ON inmate_relatives;
CREATE POLICY admin_inmate_relatives_prison ON inmate_relatives
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM inmates i
      WHERE i.id = inmate_relatives.inmate_id
        AND i.prison_id::text = auth.jwt() ->> 'prison_id'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM inmates i
      WHERE i.id = inmate_relatives.inmate_id
        AND i.prison_id::text = auth.jwt() ->> 'prison_id'
    )
  );

-- ─── 6. Audit trigger ───────────────────────────────────────────────────────
-- `fn_audit_log` (migration 00013) đọc `NEW.prison_id`/`OLD.prison_id`, nhưng
-- bảng này không có cột `prison_id`. Để tránh lỗi audit làm hỏng nghiệp vụ,
-- KHÔNG gắn `fn_audit_log` trực tiếp. Dùng một trigger audit riêng suy ra
-- prison_id từ bảng `inmates`.

CREATE OR REPLACE FUNCTION fn_audit_log_inmate_relatives()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_values JSONB;
  v_new_values JSONB;
  v_record_id  UUID;
  v_inmate_id  UUID;
  v_prison_id  UUID;
  v_user_id    UUID;
BEGIN
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF (TG_OP = 'DELETE') THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
    v_record_id  := OLD.id;
    v_inmate_id  := OLD.inmate_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    v_record_id  := NEW.id;
    v_inmate_id  := NEW.inmate_id;
  ELSE -- INSERT
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
    v_record_id  := NEW.id;
    v_inmate_id  := NEW.inmate_id;
  END IF;

  SELECT prison_id INTO v_prison_id FROM inmates WHERE id = v_inmate_id;

  INSERT INTO audit_logs (
    prison_id, user_id, action, table_name, record_id, old_values, new_values
  ) VALUES (
    v_prison_id, v_user_id, TG_OP, TG_TABLE_NAME, v_record_id, v_old_values, v_new_values
  );

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_audit_log_inmate_relatives failed for % : %', TG_OP, SQLERRM;
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_inmate_relatives ON inmate_relatives;
CREATE TRIGGER trg_audit_inmate_relatives
AFTER INSERT OR UPDATE OR DELETE ON inmate_relatives
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_inmate_relatives();
