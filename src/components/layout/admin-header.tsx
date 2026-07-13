'use client';

import { Menu, LogOut, User } from 'lucide-react';
import { logout } from '@/actions/auth';

interface AdminHeaderProps {
  profile?: {
    full_name: string;
    role: string;
  } | null;
  email?: string | null;
  onMenuClick?: () => void;
}

export function AdminHeader({ profile, email, onMenuClick }: AdminHeaderProps) {
  const displayName = profile?.full_name || email || 'Quản trị viên';
  const displayRole = profile?.role === 'super_admin' ? 'Quản trị viên cấp cao' : 'Quản trị viên';

  return (
    <header className="h-16 border-b border-hairline bg-canvas flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 rounded-full hover:bg-soft-cloud text-ink focus-ring"
            aria-label="Mở menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="flex items-center gap-2">
          {/* Simple vector representation of a National Emblem / Seal */}
          <div className="h-8 w-8 rounded-full bg-ink flex items-center justify-center text-on-primary font-bold text-sm tracking-tighter">
            VN
          </div>
          <span className="text-body-strong tracking-wide font-semibold hidden sm:inline">
            HỆ THỐNG QUẢN LÝ THĂM GẶP
          </span>
          <span className="text-body-strong tracking-wide font-semibold sm:hidden">
            QL THĂM GẶP
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 border-r border-hairline pr-4">
          <div className="h-8 w-8 rounded-full bg-soft-cloud flex items-center justify-center text-ink">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden md:block text-right">
            <p className="text-caption-md font-semibold text-ink leading-tight">
              {displayName}
            </p>
            <p className="text-utility-xs text-mute leading-none mt-0.5">
              {displayRole}
            </p>
          </div>
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-cloud text-ink hover:bg-hairline-soft transition-colors focus-ring"
            title="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
