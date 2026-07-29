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
            <p className="text-utility-xs font-normal leading-none text-mute">
              CÔNG AN TỈNH QUẢNG TRỊ
            </p>
            <p className="text-body-md font-bold uppercase leading-tight tracking-wide text-primary">
              TRẠI TẠM GIAM SỐ 1
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-caption-md font-semibold uppercase tracking-wide text-ink">
              CỔNG ĐĂNG KÝ THĂM GẶP TRỰC TUYẾN
            </p>
            <p className="text-utility-xs text-mute">
              Dành cho thân nhân người đang bị quản lý giam giữ
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
