import { NextRequest, NextResponse } from 'next/server';

import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';

interface CookieOption {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

export async function requireAdminSession(request: NextRequest) {
  const response = NextResponse.next();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieOption[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('admin_profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.is_active) {
    return null;
  }

  if (!['admin', 'super_admin'].includes(profile.role)) {
    return null;
  }

  return { response, role: profile.role as 'admin' | 'super_admin' };
}
