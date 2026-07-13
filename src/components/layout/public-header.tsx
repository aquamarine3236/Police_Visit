import Link from 'next/link';
import { PoliceLogo } from '@/components/shared/police-logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
      {/* Accent bar */}
      <div className="h-1 w-full bg-primary" />

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3 rounded-md focus-ring">
          <PoliceLogo size={44} priority />
          <div className="text-left">
            <p className="text-caption-md font-bold uppercase leading-tight tracking-wide text-primary">
              Bộ Công an
            </p>
            <p className="text-utility-xs font-medium leading-none text-mute">
              Cổng đăng ký thăm gặp trực tuyến
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-caption-md font-semibold uppercase tracking-wide text-ink">
              Đăng ký thăm gặp
            </p>
            <p className="text-utility-xs text-mute">
              Dành cho thân nhân phạm nhân
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
