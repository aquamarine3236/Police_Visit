import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { AdminLayoutShell } from '@/components/layout/admin-layout-shell';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Admin - Hệ thống Quản lý Đăng ký Thăm gặp',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;

  if (!supabase || !session) {
    // If no session exists, render the content cleanly (e.g. for /admin/login)
    return <section className="min-h-screen bg-soft-cloud flex items-center justify-center">{children}</section>;
  }

  // Fetch admin profile details
  let profile = null;
  try {
    const { data } = await supabase
      .from('admin_profiles')
      .select('full_name, role')
      .eq('id', session.user.id)
      .maybeSingle();
    profile = data;
  } catch (err) {
    console.error('Failed to fetch admin profile:', err);
  }

  return (
    <AdminLayoutShell profile={profile} email={session.user?.email}>
      {children}
    </AdminLayoutShell>
  );
}
