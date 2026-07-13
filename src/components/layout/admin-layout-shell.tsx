'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { AdminSidebar } from './admin-sidebar';
import { AdminHeader } from './admin-header';

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

  return (
    <div className="flex min-h-screen bg-soft-cloud text-ink font-sans">
      {/* Mobile Sidebar drawer overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-ink/40 z-40 md:hidden transition-opacity duration-200"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar (off-canvas sliding drawer) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-canvas transform transition-transform duration-200 ease-in-out md:hidden flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-0 -left-64'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-hairline">
          <span className="text-body-strong font-semibold uppercase tracking-wider text-mute">
            Menu quản trị
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-full hover:bg-soft-cloud text-ink focus-ring"
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* We can re-use the AdminSidebar but remove the sticky height so it fills the drawer */}
          <AdminSidebar />
        </div>
      </div>

      {/* Desktop Sidebar (visible on md+) */}
      <div className="hidden md:flex md:w-64 flex-col">
        <AdminSidebar />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        <AdminHeader
          profile={profile}
          email={email}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
