-- Migration 00014: Grant permissions required for the custom access token hook
--
-- Supabase runs `custom_access_token_hook` as the `supabase_auth_admin` role.
-- Without explicit grants, the hook is denied and the `app_role` / `prison_id`
-- claims are never injected into the JWT — which in turn breaks EVERY admin RLS
-- policy that relies on `auth.jwt() ->> 'prison_id'`.
--
-- These grants follow the official Supabase custom-claims guide.

-- Allow the auth admin role to execute the hook.
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  TO supabase_auth_admin;

-- The hook must NOT be callable by the public API roles.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM authenticated, anon, public;

-- The hook reads `admin_profiles`, so the auth admin role needs access to the
-- schema and SELECT on that table.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

GRANT SELECT ON public.admin_profiles TO supabase_auth_admin;

-- Ensure RLS on admin_profiles does not block the hook's SELECT. The auth admin
-- role bypasses RLS by default, but we add an explicit permissive policy so the
-- intent is documented and robust across Supabase versions.
DROP POLICY IF EXISTS auth_admin_read_admin_profiles ON public.admin_profiles;
CREATE POLICY auth_admin_read_admin_profiles ON public.admin_profiles
  FOR SELECT
  TO supabase_auth_admin
  USING (true);
