'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { AdminSidebar } from './admin-sidebar';
import { AdminHeader } from './admin-header';
import { cn } from '@/lib/utils';

interface AdminLayoutShellProps {
  profile?: {
    full_name: string;
    role: string;
  } | null;
  email?: string | null;
  children: React.ReactNode;
}

export function AdminLayoutShell({ profile, email, children }: AdminLayoutShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const role = profile?.role === 'super_admin' ? 'super_admin' : 'admin';

  return (
    <div className="flex min-h-screen bg-soft-cloud font-sans text-ink">
      {/* Mobile drawer overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-ink/50 backdrop-blur-sm transition-opacity duration-200 md:hidden',
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile off-canvas sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out md:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Menu quản trị"
      >
        <div className="relative h-full">
          <button
            onClick={() => setSidebarOpen(false)}
            className="absolute right-3 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground focus-ring"
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" />
          </button>
          <AdminSidebar role={role} onNavigate={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-screen md:block">
        <AdminSidebar role={role} />
      </div>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          profile={profile}
          email={email}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" style={{ scrollbarGutter: 'stable' }}>
          <div className="mx-auto max-w-7xl animate-fade-in-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
