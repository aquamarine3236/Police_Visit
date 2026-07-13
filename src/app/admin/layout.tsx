import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Admin - Hệ thống Quản lý Đăng ký Thăm gặp',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <section className="min-h-screen bg-slate-50">{children}</section>;
}
