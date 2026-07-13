'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  /** Visual style: `surface` for light backgrounds, `sidebar` for dark bars. */
  tone?: 'surface' | 'sidebar';
}

export function ThemeToggle({ className, tone = 'surface' }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-ring',
        tone === 'surface'
          ? 'text-mute hover:bg-soft-cloud hover:text-ink'
          : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
        className,
      )}
    >
      {/* Render a neutral icon until mounted to avoid hydration mismatch */}
      {!mounted ? (
        <Sun className="h-[18px] w-[18px]" />
      ) : isDark ? (
        <Sun className="h-[18px] w-[18px]" />
      ) : (
        <Moon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
