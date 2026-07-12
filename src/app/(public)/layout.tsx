import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Cổng thông tin thăm gặp',
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
