-- Migration 00020: Make date_of_birth nullable
--
-- Requirement
-- -----------
-- Ngày sinh (date_of_birth) không còn bắt buộc ở cả người bị giam giữ (inmates)
-- lẫn thân nhân đi thăm (registration_visitors). Cho phép để trống ở form user
-- site và admin, nên cột phải cho phép NULL.
--
-- Change
-- ------
-- Gỡ ràng buộc NOT NULL trên hai cột date_of_birth. Không đụng tới dữ liệu hiện
-- có; các bản ghi đã có ngày sinh vẫn giữ nguyên.

ALTER TABLE inmates
  ALTER COLUMN date_of_birth DROP NOT NULL;

ALTER TABLE registration_visitors
  ALTER COLUMN date_of_birth DROP NOT NULL;
