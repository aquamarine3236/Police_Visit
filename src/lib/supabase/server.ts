import { cookies } from 'next/headers';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';

interface CookieOption {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

export async function createServerClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieOption[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Creates a cookie-less anonymous Supabase client.
 *
 * This client does NOT read request cookies or the session, so it is safe to
 * use inside `unstable_cache` callbacks (which run outside the request scope
 * and must not access dynamic data sources such as `cookies()`). It is only
 * suitable for public, RLS-safe reads (e.g. cached scheduling settings).
 */
export function createAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Creates a Supabase client authenticated with the SERVICE ROLE key.
 *
 * This client BYPASSES Row-Level Security, so it must ONLY be used in trusted
 * server-side code AFTER the caller has been authorised (e.g. via
 * `requireAdminAuth`). It is required for privileged admin writes such as the
 * bulk inmate import, where relying on the user JWT's `prison_id` claim would
 * otherwise be blocked by RLS.
 *
 * Returns `null` when `SUPABASE_SERVICE_ROLE_KEY` is not configured, letting
 * callers fall back to the cookie-based client.
 */
export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
