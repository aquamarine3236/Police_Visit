-- ============================================================================
-- 11_functions_auth — Custom access token hook + required grants
-- ============================================================================
-- Sources (merged):
--   00011_setup_auth_hooks_and_seeds.sql  (custom_access_token_hook)
--   00014_grant_auth_hook.sql             (grants + auth_admin RLS policy)
--
-- The hook injects `app_role` and `prison_id` claims into every JWT. Supabase
-- runs it as the `supabase_auth_admin` role, so the grants below are required —
-- without them the claims are never injected and every admin RLS policy that
-- relies on `auth.jwt() ->> 'prison_id'` breaks.
--
-- Registered in supabase/config.toml under [auth.hook.custom_access_token]:
--   uri = "pg-functions://postgres/public/custom_access_token_hook"

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  claims jsonb;
  user_role text;
  user_prison_id uuid;
BEGIN
  claims := COALESCE(event->'claims', '{}'::jsonb);

  SELECT role, prison_id
    INTO user_role, user_prison_id
  FROM public.admin_profiles
  WHERE id = (event->>'user_id')::uuid
    AND is_active = true;

  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_role}', to_jsonb(user_role));
    claims := jsonb_set(claims, '{prison_id}', to_jsonb(user_prison_id));
  ELSE
    claims := jsonb_set(claims, '{app_role}', to_jsonb('anon'));
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Allow the auth admin role to execute the hook; deny the public API roles.
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM authenticated, anon, public;

-- The hook reads admin_profiles, so the auth admin role needs schema usage and
-- SELECT on that table.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.admin_profiles TO supabase_auth_admin;

-- Explicit permissive policy so the hook's SELECT is never blocked by RLS,
-- robust across Supabase versions (the role bypasses RLS by default anyway).
DROP POLICY IF EXISTS auth_admin_read_admin_profiles ON public.admin_profiles;
CREATE POLICY auth_admin_read_admin_profiles ON public.admin_profiles
  FOR SELECT
  TO supabase_auth_admin
  USING (true);
