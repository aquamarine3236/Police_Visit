'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, ClipboardList, Loader2, Settings, ShieldCheck, Users, Users2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PoliceLogo } from '@/components/shared/police-logo';

interface AdminSidebarProps {
  /** Determines which navigation items are shown. */
  role?: 'admin' | 'super_admin';
  /** Called when a nav link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: typeof ClipboardList;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Danh sách đăng ký',
    href: '/admin',
    icon: ClipboardList,
    exact: true,
  },
  {
    label: 'Quản lý người bị giam giữ',
    href: '/admin/inmates',
    icon: Users,
  },
  {
    label: 'Thân nhân người bị giam giữ',
    href: '/admin/relatives',
    icon: Users2,
  },
  {
    label: 'Cấu hình lịch',
    href: '/admin/settings',
    icon: Settings,
  },
];

// Super admins manage admins and prisons only — prison-data pages are
// blocked for them by the middleware, so their nav shows just these two.
const SUPER_ADMIN_NAV_ITEMS: NavItem[] = [
  {
    label: 'Quản lý quản trị viên',
    href: '/admin/super',
    icon: ShieldCheck,
    exact: true,
  },
  {
    label: 'Quản lý trại giam',
    href: '/admin/super/prisons',
    icon: Building2,
  },
];

export function AdminSidebar({ role = 'admin', onNavigate }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  // `useTransition` lets us give instant feedback the moment a nav item is
  // clicked: we mark the target as "navigating" (a spinner replaces its icon)
  // while Next.js prepares the next route, instead of the click feeling dead
  // until the new screen is ready.
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const handleNavigate = (href: string) => (e: React.MouseEvent) => {
    // Let modifier/middle clicks (open in new tab) use the native <Link>.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (href === pathname) {
      onNavigate?.();
      return;
    }
    e.preventDefault();
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
      onNavigate?.();
    });
  };

  return (
    <aside className="flex h-full min-h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/95 p-1 shadow-sm">
          <PoliceLogo size={34} priority />
        </div>
        <div className="min-w-0">
          <p className="truncate text-caption-md font-bold uppercase tracking-wide text-sidebar-foreground">
            Quản trị hệ thống
          </p>
          <p className="truncate text-utility-xs text-sidebar-muted">
            Cổng thăm gặp trực tuyến
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-5">
        <p className="px-3 pb-2 text-utility-xs font-semibold uppercase tracking-wider text-sidebar-muted">
          Điều hướng
        </p>
        {(role === 'super_admin' ? SUPER_ADMIN_NAV_ITEMS : NAV_ITEMS).map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          const isNavigating = isPending && pendingHref === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onClick={handleNavigate(item.href)}
              aria-current={isActive ? 'page' : undefined}
              aria-busy={isNavigating || undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-caption-md font-medium transition-colors duration-150 focus-ring',
                isActive
                  ? 'bg-sidebar-active font-semibold text-sidebar-foreground'
                  : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
              )}
            >
              {/* Gold active indicator */}
              <span
                className={cn(
                  'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gold transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              />
              {isNavigating ? (
                <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" />
              ) : (
                <Icon className="h-[18px] w-[18px] shrink-0" />
              )}
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-utility-xs text-sidebar-muted">© 2026 · Bộ Công an</p>
        <p className="mt-0.5 text-utility-xs text-sidebar-muted/70">
          Hệ thống quản lý thăm gặp
        </p>
      </div>
    </aside>
  );
}
