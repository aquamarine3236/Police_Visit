'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, Settings, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AdminSidebar() {
  const pathname = usePathname();

  const navItems = [
    {
      label: 'Danh sách đăng ký',
      href: '/admin',
      icon: ClipboardList,
      exact: true,
    },
    {
      label: 'Quản lý phạm nhân',
      href: '/admin/inmates',
      icon: Users,
    },
    {
      label: 'Cấu hình lịch',
      href: '/admin/settings',
      icon: Settings,
    },
  ];

  return (
    <aside className="w-64 border-r border-hairline bg-canvas flex flex-col h-screen sticky top-0 shrink-0">
      <div className="p-6">
        <h2 className="text-body-strong tracking-wider uppercase text-mute">
          Quản trị hệ thống
        </h2>
      </div>
      <nav className="flex-1 px-4 space-y-1.5">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href) && (item.href !== '/admin' || pathname === '/admin');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 text-caption-md font-medium transition-all duration-150 focus-ring',
                isActive
                  ? 'bg-ink text-on-primary rounded-lg font-semibold'
                  : 'text-mute hover:bg-soft-cloud hover:text-ink rounded-lg'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-6 border-t border-hairline">
        <p className="text-utility-xs text-mute text-center">
          © 2026 Hệ thống Thăm gặp
        </p>
      </div>
    </aside>
  );
}
