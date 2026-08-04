INSERT INTO prisons (id, name, code, address, phone, is_active)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Trại giam NK',
  'PRISON-001',
  'Địa chỉ mẫu',
  '0123456789',
  true
)
ON CONFLICT (code) DO NOTHING;

-- Trại giam thứ hai — dùng để kiểm thử tính cô lập dữ liệu giữa các trại và
-- tính năng chuyển trại của admin (multi-prison assignments).
INSERT INTO prisons (id, name, code, address, phone, is_active)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Trại giam TH',
  'PRISON-002',
  'Địa chỉ mẫu 2',
  '0987654321',
  true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO scheduling_settings (
  prison_id,
  visit_time,
  morning_start_time,
  morning_end_time,
  afternoon_start_time,
  afternoon_end_time,
  max_visit_per_time,
  suitable_days
)
SELECT
  p.id,
  30,
  '07:30',
  '11:30',
  '13:30',
  '17:30',
  2,
  '{4,5}'
FROM prisons p
WHERE p.code = 'PRISON-001'
ON CONFLICT (prison_id) DO NOTHING;
