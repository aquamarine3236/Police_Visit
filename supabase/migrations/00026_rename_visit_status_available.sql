-- Migration 00026: Rename inmate visit_status value "Có thể thăm gặp" → "Được thăm gặp"
--
-- Changes:
-- 1. Drop the existing visit_status CHECK constraint so old rows can be updated.
-- 2. Backfill: update all existing inmates with the old value to the new value.
-- 3. Change the column DEFAULT to the new value.
-- 4. Re-add the CHECK constraint allowing ONLY the new set of values
--    ('Được thăm gặp', 'Hạn chế thăm gặp').
-- 5. Recreate the `public_inmates_read` RLS policy to reference the new value.
--
-- The value "Hạn chế thăm gặp" is unchanged.

-- ─── 1. Drop the CHECK constraint ───────────────────────────────────────────

ALTER TABLE inmates DROP CONSTRAINT IF EXISTS inmates_visit_status_check;

-- ─── 2. Backfill existing rows ──────────────────────────────────────────────

UPDATE inmates
SET visit_status = 'Được thăm gặp'
WHERE visit_status = 'Có thể thăm gặp';

-- ─── 3. Change the column default ───────────────────────────────────────────

ALTER TABLE inmates
  ALTER COLUMN visit_status SET DEFAULT 'Được thăm gặp';

-- ─── 4. Re-add the CHECK constraint (new values only) ───────────────────────

ALTER TABLE inmates ADD CONSTRAINT inmates_visit_status_check
  CHECK (visit_status IN ('Được thăm gặp', 'Hạn chế thăm gặp'));

-- ─── 5. Recreate the public read RLS policy ─────────────────────────────────
-- The old policy exposed inmates with visit_status = 'Có thể thăm gặp'.
-- It must now reference the renamed value.

DROP POLICY IF EXISTS public_inmates_read ON inmates;

CREATE POLICY public_inmates_read ON inmates
  FOR SELECT
  USING (deleted_at IS NULL AND visit_status = 'Được thăm gặp');
