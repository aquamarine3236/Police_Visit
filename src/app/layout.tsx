import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro, Inter } from 'next/font/google';
import { ThemeProvider, themeInitScript } from '@/components/shared/theme-provider';
import './globals.css';

const beVietnamPro = Be_Vietnam_Pro({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'vietnamese'],
  variable: '--font-be-vietnam-pro',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: {
    default: 'Hệ thống Quản lý Đăng ký Thăm gặp',
    template: '%s · Hệ thống Quản lý Đăng ký Thăm gặp',
  },
  description:
    'Hệ thống quản lý đăng ký thăm gặp phạm nhân trực tuyến — đăng ký lịch thăm gặp, quản lý phạm nhân, và cài đặt lịch trình.',
  applicationName: 'Hệ thống Quản lý Đăng ký Thăm gặp',
  icons: {
    icon: [{ url: '/police_logo.svg', type: 'image/svg+xml' }],
    shortcut: ['/police_logo.svg'],
    apple: ['/police_logo.svg'],
  },
  openGraph: {
    title: 'Hệ thống Quản lý Đăng ký Thăm gặp',
    description:
      'Cổng đăng ký thăm gặp trực tuyến dành cho thân nhân và hệ thống quản trị nghiệp vụ.',
    type: 'website',
    locale: 'vi_VN',
    images: [{ url: '/police_logo.svg', alt: 'Huy hiệu Công an nhân dân Việt Nam' }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1e5631' },
    { media: '(prefers-color-scheme: dark)', color: '#0f3d20' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
