'use client';

import { usePathname } from 'next/navigation';
import { LogOut, Menu, User } from 'lucide-react';
import { logout } from '@/actions/auth';
import { ThemeToggle } from '@/components/shared/theme-toggle';

interface AdminHeaderProps {
  profile?: {
    full_name: string;
    role: string;
  } | null;
  email?: string | null;
  onMenuClick?: () => void;
}

const CRUMB_LABELS: Record<string, string> = {
  admin: 'Danh sách đăng ký',
  inmates: 'Quản lý người bị giam giữ',
  settings: 'Cấu hình lịch',
  login: 'Đăng nhập',
};

/**
 * Returns the label of the current admin tab based on the pathname.
 * The most specific (deepest) known segment wins, so e.g. `/admin/inmates`
 * shows "Quản lý người bị giam giữ" while `/admin` shows "Danh sách đăng ký".
 */
function useCurrentTabLabel(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const label = CRUMB_LABELS[segments[i]];
    if (label) return label;
  }
  return 'Quản trị';
}

export function AdminHeader({ profile, email, onMenuClick }: AdminHeaderProps) {
  const pathname = usePathname();
  const currentTab = useCurrentTabLabel(pathname);

  const displayName = profile?.full_name || email || 'Quản trị viên';
  const displayRole =
    profile?.role === 'super_admin' ? 'Quản trị viên cấp cao' : 'Quản trị viên';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-hairline bg-canvas/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 sm:px-6">
      {/* Left: menu + breadcrumb */}
      <div className="flex min-w-0 items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink hover:bg-soft-cloud focus-ring md:hidden"
            aria-label="Mở menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="min-w-0 truncate text-body-strong font-semibold text-ink">
          {currentTab}
        </h1>
      </div>

      {/* Right: theme toggle + user + logout */}
      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />

        <div className="flex items-center gap-3 border-l border-hairline pl-2 sm:pl-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
            <User className="h-[18px] w-[18px]" />
          </div>
          <div className="hidden text-right md:block">
            <p className="text-caption-md font-semibold leading-tight text-ink">
              {displayName}
            </p>
            <p className="mt-0.5 text-utility-xs leading-none text-mute">
              {displayRole}
            </p>
          </div>
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-mute transition-colors hover:bg-danger-soft hover:text-danger focus-ring"
            title="Đăng xuất"
            aria-label="Đăng xuất"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>
    </header>
  );
}
