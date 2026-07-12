import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Admin - Hệ thống Quản lý Đăng ký Thăm gặp',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
