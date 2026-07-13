import Link from 'next/link';

export function PublicHeader() {
  return (
    <header className="bg-canvas border-b border-hairline sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 h-20 flex flex-col sm:flex-row items-center justify-between gap-4 py-4 sm:py-0">
        <Link href="/" className="flex items-center gap-3">
          {/* Decorative emblem representation */}
          <div className="h-10 w-10 rounded-full bg-sale flex items-center justify-center text-on-primary font-bold text-lg border-2 border-canvas shadow-sm">
            ★
          </div>
          <div className="text-left">
            <h1 className="text-caption-md font-bold text-ink tracking-wide leading-tight">
              BỘ CÔNG AN
            </h1>
            <p className="text-utility-xs text-mute font-medium leading-none">
              TRẠI GIAM QUẢN LÝ THĂM GẶP
            </p>
          </div>
        </Link>

        <div className="text-center sm:text-right">
          <h2 className="text-body-strong text-ink tracking-wide uppercase">
            Cổng Đăng Ký Thăm Gặp
          </h2>
          <p className="text-caption-sm text-mute">
            Đăng ký lịch hẹn trực tuyến dành cho thân nhân
          </p>
        </div>
      </div>
    </header>
  );
}
