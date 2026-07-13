-- ============================================================================
-- Admin profile seed template (production hand-off)
-- ============================================================================
--
-- The admin login is a Supabase Auth user. Because passwords are hashed and
-- managed by Supabase Auth, the auth user MUST be created first, then linked to
-- an `admin_profiles` row here.
--
-- STEP 1 — Create the auth user (choose ONE method):
--
--   a) Supabase Dashboard -> Authentication -> Users -> "Add user"
--      Set email + a strong password (min 8 chars). Copy the generated user id.
--
--   b) Supabase Admin API (server-side, service role key required):
--
--        curl -X POST 'https://<project-ref>.supabase.co/auth/v1/admin/users' \
--          -H "apikey: <SERVICE_ROLE_KEY>" \
--          -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
--          -H "Content-Type: application/json" \
--          -d '{
--            "email": "admin@example.com",
--            "password": "<STRONG_PASSWORD>",
--            "email_confirm": true
--          }'
--
--      The response JSON contains the new user's "id" (a UUID).
--
-- STEP 2 — Fill in the placeholders below and run this script against the
--          production database (Supabase Dashboard -> SQL Editor, or psql).
--          The default prison (code 'PRISON-001') is seeded by supabase/seed.sql.
-- ============================================================================

INSERT INTO admin_profiles (id, prison_id, full_name, role, is_active)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid, -- STEP 1 auth user id
  p.id,
  'Quản trị viên',                              -- admin display name
  'admin',                                       -- 'admin' or 'super_admin'
  true
FROM prisons p
WHERE p.code = 'PRISON-001'
ON CONFLICT (id) DO UPDATE
  SET prison_id = EXCLUDED.prison_id,
      full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      is_active = EXCLUDED.is_active;

-- Verify the profile and that the JWT claim hook will resolve role/prison:
--   SELECT id, prison_id, full_name, role, is_active FROM admin_profiles;
